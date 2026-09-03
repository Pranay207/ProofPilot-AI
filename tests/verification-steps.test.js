import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFallbackAiJudgment,
  safeParseAiJson,
  validateAiCaseJudgment,
  withAiTimeout,
} from "../src/lib/aiGuardrails.js";
import {
  buildFallbackAiJudgment as schemaFallback,
  safeParseAiJson as schemaParse,
  validateAiCaseJudgment as schemaValidate,
} from "../server/ml/schemaValidator.js";
import { deriveCaseState } from "../src/lib/workflow.js";
import { scoreCase } from "../src/lib/ruleEngine.js";
import { applyPersistedEvidenceToCase, persistConnectorEvidence } from "../server/services/evidencePersistenceService.js";

const FALLBACK_DRAFT =
  "We acknowledge the customer claim. Our team is reviewing payment, refund, fulfilment, communication, and policy evidence before taking a final action. This response is held for human review.";

describe("AI schema fallback and timeout workflow", () => {
  it("uses the deterministic fallback draft when schema fields are missing or the wrong type", () => {
    const missingFields = schemaValidate({});
    const wrongTypes = schemaValidate({
      intent: 12,
      confidence: "high",
      missing_evidence: "delivery proof",
      response_draft: { text: "LLM draft" },
    });
    const parsed = schemaParse("{not-json");
    const fallback = schemaFallback({ dispute_type: "goods_not_received" }, parsed.reason);

    assert.equal(missingFields.response_draft, FALLBACK_DRAFT);
    assert.equal(missingFields.requires_human_approval, true);
    assert.equal(missingFields.safe_to_auto_submit, false);
    assert.equal(wrongTypes.response_draft, FALLBACK_DRAFT);
    assert.equal(wrongTypes.intent, "unknown");
    assert.equal(wrongTypes.confidence, 0);
    assert.deepEqual(wrongTypes.missing_evidence, []);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.fallback, true);
    assert.equal(parsed.reason, "AI_INVALID_JSON");
    assert.equal(fallback.fallback, true);
    assert.equal(fallback.judgment.response_draft, FALLBACK_DRAFT);
    assert.equal(schemaParse, safeParseAiJson);
    assert.equal(schemaValidate, validateAiCaseJudgment);
    assert.equal(schemaFallback, buildFallbackAiJudgment);
  });

  it("on AI timeout still proceeds to AWAITING_APPROVAL instead of getting stuck", async () => {
    const timeout = await withAiTimeout(() => new Promise(() => {}), 5);
    const caseItem = {
      payment_id: "pay_timeout_001",
      dispute_id: "disp_timeout_001",
      packet_status: "draft",
      readiness_score: 100,
      available_evidence: ["invoice", "delivery proof", "tracking snapshot", "customer communication", "policy snapshot"],
      missing_evidence: [],
      merchant_response_draft: "",
      timeline_events: [{ event: "submitted_for_review", timestamp: "2026-09-03T00:00:00Z" }],
    };
    const fallback = buildFallbackAiJudgment(caseItem, timeout.reason);
    const afterTimeout = {
      ...caseItem,
      merchant_response_draft: fallback.judgment.response_draft,
    };

    assert.equal(timeout.ok, false);
    assert.equal(timeout.fallback, true);
    assert.equal(timeout.reason, "AI_TIMEOUT");
    assert.equal(fallback.fallback, true);
    assert.equal(fallback.judgment.requires_human_approval, true);
    assert.notEqual(deriveCaseState(caseItem), "AWAITING_APPROVAL");
    assert.equal(deriveCaseState(afterTimeout), "AWAITING_APPROVAL");
  });
});

describe("connector fault isolation", () => {
  it("keeps other connectors when Shiprocket times out or returns 500, and treats its evidence as missing", async () => {
    const CONNECTORS = [
      {
        CONNECTOR_ID: "razorpay_refund",
        CONNECTOR_NAME: "Razorpay Refund Status",
        collectEvidence: async () => ({
          connector: "razorpay_refund",
          status: "success",
          evidence: [{ evidence_key: "payment receipt", auto_available: true }],
        }),
      },
      {
        CONNECTOR_ID: "shiprocket",
        CONNECTOR_NAME: "Shiprocket Delivery Tracking",
        collectEvidence: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          throw new Error("Shiprocket API error [500] on /courier/track/awb/TEST: upstream timeout");
        },
      },
      {
        CONNECTOR_ID: "email_summary",
        CONNECTOR_NAME: "Email / WhatsApp Communication Evidence",
        collectEvidence: async () => ({
          connector: "email_summary",
          status: "success",
          evidence: [{ evidence_key: "customer communication", auto_available: true }],
        }),
      },
    ];

    const results = await Promise.allSettled(
      CONNECTORS.map(async (connector) => {
        try {
          const result = await connector.collectEvidence({});
          return { ...result, connector_name: connector.CONNECTOR_NAME };
        } catch (error) {
          return {
            connector: connector.CONNECTOR_ID,
            connector_name: connector.CONNECTOR_NAME,
            status: "error",
            error: error.message,
            evidence: [],
          };
        }
      })
    );

    assert.equal(results.every((result) => result.status === "fulfilled"), true);
    const connectorResults = results.map((result) => result.value);
    const shiprocket = connectorResults.find((item) => item.connector === "shiprocket");
    const razorpay = connectorResults.find((item) => item.connector === "razorpay_refund");
    const email = connectorResults.find((item) => item.connector === "email_summary");

    assert.equal(shiprocket.status, "error");
    assert.match(shiprocket.error, /500|timeout/i);
    assert.deepEqual(shiprocket.evidence, []);
    assert.equal(razorpay.status, "success");
    assert.equal(email.status, "success");
    assert.equal(razorpay.evidence.length > 0, true);
    assert.equal(email.evidence.length > 0, true);

    const autoAvailable = connectorResults
      .flatMap((item) => item.evidence || [])
      .filter((item) => item.auto_available === true)
      .map((item) => item.evidence_key);

    assert.equal(autoAvailable.includes("delivery proof"), false);
    assert.equal(autoAvailable.includes("tracking snapshot"), false);
    assert.ok(autoAvailable.includes("payment receipt"));
    assert.ok(autoAvailable.includes("customer communication"));

    const scored = scoreCase({
      dispute_type: "goods_not_received",
      available_evidence: autoAvailable,
      evidence_files: {},
    });
    assert.ok(scored.missing_evidence.includes("delivery proof"));
    assert.ok(scored.missing_evidence.includes("tracking snapshot"));
    assert.equal(scored.available_evidence.includes("delivery proof"), false);
    assert.ok(scored.readiness_score < 80);
  });
});

describe("connector evidence persistence and readiness", () => {
  const baseCase = {
    dispute_type: "goods_not_received",
    available_evidence: [],
    missing_evidence: ["invoice", "delivery proof", "tracking snapshot", "customer communication", "policy snapshot"],
    evidence_files: {},
  };

  it("counts connector evidence toward readiness only after a timestamped persist succeeds", async () => {
    const liveOnly = scoreCase({
      ...baseCase,
      available_evidence: ["delivery proof", "tracking snapshot"],
    });
    assert.equal(liveOnly.available_evidence.includes("delivery proof"), false);
    assert.equal(liveOnly.readiness_score, 0);

    const connectorItems = [
      { evidence_key: "delivery proof", auto_available: true, source: "shiprocket_api" },
      { evidence_key: "tracking snapshot", auto_available: true, source: "shiprocket_api" },
    ];
    const store = [];
    const { persisted, failed } = await persistConnectorEvidence({
      items: connectorItems,
      persistOne: async (item) => {
        const record = { attached_at: "2026-09-03T08:00:00.000Z", source: item.source };
        store.push({ key: item.evidence_key, ...record });
        return record;
      },
    });

    assert.equal(failed.length, 0);
    assert.equal(store.length, 2);
    assert.ok(store.every((row) => row.attached_at));

    const afterPersist = scoreCase(applyPersistedEvidenceToCase(baseCase, persisted));
    assert.ok(afterPersist.available_evidence.includes("delivery proof"));
    assert.ok(afterPersist.available_evidence.includes("tracking snapshot"));
    assert.equal(afterPersist.readiness_score, 40);
    assert.ok(afterPersist.readiness_score > liveOnly.readiness_score);
  });

  it("does not increase readiness when connector evidence fails to persist", async () => {
    const before = scoreCase(baseCase);
    const { persisted, failed } = await persistConnectorEvidence({
      items: [
        { evidence_key: "delivery proof", auto_available: true, source: "shiprocket_api" },
        { evidence_key: "invoice", auto_available: true, source: "razorpay_api" },
      ],
      persistOne: async (item) => {
        if (item.evidence_key === "delivery proof") {
          throw new Error("database write failed");
        }
        return { attached_at: "2026-09-03T08:00:00.000Z", source: item.source };
      },
    });

    assert.equal(failed.length, 1);
    assert.equal(failed[0].evidence_key, "delivery proof");
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].evidence_key, "invoice");

    const afterPartial = scoreCase(applyPersistedEvidenceToCase(baseCase, persisted));
    assert.equal(afterPartial.available_evidence.includes("delivery proof"), false);
    assert.ok(afterPartial.available_evidence.includes("invoice"));
    assert.equal(afterPartial.readiness_score, 20);

    const afterTotalFailure = scoreCase(applyPersistedEvidenceToCase(baseCase, []));
    assert.equal(afterTotalFailure.readiness_score, before.readiness_score);
  });
});
