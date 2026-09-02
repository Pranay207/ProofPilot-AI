import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { describe, it, before, after } from "node:test";

process.env.DOTENV_CONFIG_PATH = path.resolve(process.cwd(), ".env.test-missing");
process.env.NODE_ENV = "test";
process.env.USE_DATABASE = "false";
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";
delete process.env.AUTH_JWKS_URL;
delete process.env.AUTH_ISSUER;
delete process.env.AUTH_AUDIENCE;
delete process.env.EVIDENCE_STORAGE_PROVIDER;
delete process.env.EVIDENCE_S3_BUCKET;

const { app } = await import("../server/index.js");
const { withAiTimeout } = await import("../src/lib/aiGuardrails.js");
const { getRequired } = await import("../src/lib/ruleEngine.js");
const { buildRazorpayEvidenceMapping } = await import("../src/lib/razorpayEvidenceMapper.js");

let server;
let baseUrl;

function sign(body) {
  return crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
}

function disputePayload(id = "disp_integration_001", event = "payment.dispute.created", status = "open") {
  return {
    event,
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      dispute: {
        entity: {
          id,
          payment_id: `pay_${id}`,
          amount: 420000,
          currency: "INR",
          reason_code: "goods_not_received",
          reason_description: "Customer says order was not received",
          status,
          respond_by: Math.floor((Date.now() + 5 * 86400000) / 1000),
        },
      },
      payment: {
        entity: {
          id: `pay_${id}`,
          order_id: `order_${id}`,
          email: "customer@example.in",
          contact: "9999999999",
          amount: 420000,
          currency: "INR",
          status: "captured",
        },
      },
    },
  };
}

async function json(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

describe("ProofPilot production guardrails", () => {
  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it("rejects unsigned or invalid Razorpay webhooks without creating a case", async () => {
    const raw = JSON.stringify(disputePayload("disp_invalid_signature"));
    const { response, body } = await json("/api/webhooks/razorpay", {
      method: "POST",
      body: raw,
      headers: { "X-Razorpay-Signature": "bad_signature" },
    });

    assert.equal(response.status, 400);
    assert.equal(body.failure_state, "WEBHOOK_SIGNATURE_FAILED");
  });

  it("creates one case for a valid dispute webhook and ignores the duplicate safely", async () => {
    const raw = JSON.stringify(disputePayload("disp_duplicate_safe"));
    const headers = { "X-Razorpay-Signature": sign(raw) };

    const first = await json("/api/webhooks/razorpay", { method: "POST", body: raw, headers });
    const second = await json("/api/webhooks/razorpay", { method: "POST", body: raw, headers });

    assert.equal(first.response.status, 200);
    assert.equal(first.body.created_case, true);
    assert.equal(second.response.status, 200);
    assert.equal(second.body.duplicate, true);
    assert.equal(second.body.failure_state, "WEBHOOK_DUPLICATE");
  });

  it("updates existing cases from Razorpay dispute lifecycle webhooks", async () => {
    const disputeId = "disp_lifecycle_update";
    const createdRaw = JSON.stringify(disputePayload(disputeId));
    const reviewRaw = JSON.stringify(disputePayload(disputeId, "payment.dispute.under_review", "under_review"));
    const wonRaw = JSON.stringify(disputePayload(disputeId, "payment.dispute.won", "won"));

    const created = await json("/api/webhooks/razorpay", {
      method: "POST",
      body: createdRaw,
      headers: { "X-Razorpay-Signature": sign(createdRaw) },
    });
    const underReview = await json("/api/webhooks/razorpay", {
      method: "POST",
      body: reviewRaw,
      headers: { "X-Razorpay-Signature": sign(reviewRaw) },
    });
    const won = await json("/api/webhooks/razorpay", {
      method: "POST",
      body: wonRaw,
      headers: { "X-Razorpay-Signature": sign(wonRaw) },
    });

    assert.equal(created.body.created_case, true);
    assert.equal(underReview.body.updated_case, true);
    assert.equal(underReview.body.lifecycle_status, "under_review");
    assert.equal(won.body.updated_case, true);
    assert.equal(won.body.lifecycle_status, "won");

    const casesResponse = await json("/api/cases");
    const caseItem = casesResponse.body.find((item) => item.dispute_id === disputeId);
    assert.ok(caseItem);
    assert.equal(caseItem.status, "won");
    assert.equal(caseItem.packet_status, "closed");
    assert.ok(caseItem.timeline_events.some((item) => item.event === "payment.dispute.under_review"));
    assert.ok(caseItem.timeline_events.some((item) => item.event === "payment.dispute.won"));
  });

  it("advertises the full Razorpay dispute webhook event checklist", async () => {
    const status = await json("/api/integrations/razorpay/status");
    assert.equal(status.response.status, 200);
    for (const event of [
      "payment.dispute.created",
      "payment.dispute.under_review",
      "payment.dispute.action_required",
      "payment.dispute.won",
      "payment.dispute.lost",
      "payment.dispute.closed",
    ]) {
      assert.ok(status.body.required_events.includes(event));
    }
  });

  it("syncs Razorpay disputes from the list API and imports lifecycle status", async () => {
    const originalFetch = global.fetch;
    process.env.RAZORPAY_KEY_ID = "rzp_test_sync_key";
    process.env.RAZORPAY_KEY_SECRET = "sync_secret";
    global.fetch = async (url, options) => {
      const target = String(url);
      if (target.startsWith("https://api.razorpay.com/v1/disputes")) {
        return new Response(JSON.stringify({
          count: 1,
          items: [{
            id: "disp_sync_won",
            payment_id: "pay_sync_won",
            amount: 123400,
            amount_deducted: 123400,
            currency: "INR",
            reason_code: "goods_not_received",
            reason_description: "Customer says delivery was not received",
            status: "won",
            respond_by: Math.floor((Date.now() + 2 * 86400000) / 1000),
            created_at: Math.floor(Date.now() / 1000),
          }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (target.startsWith("https://api.razorpay.com/v1/payments/pay_sync_won")) {
        return new Response(JSON.stringify({
          id: "pay_sync_won",
          order_id: "order_sync_won",
          email: "sync@example.in",
          contact: "9000000000",
          amount: 123400,
          currency: "INR",
          status: "captured",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return originalFetch(url, options);
    };

    try {
      const synced = await json("/api/integrations/razorpay/sync-disputes", {
        method: "POST",
        body: JSON.stringify({ count: 1 }),
      });
      assert.equal(synced.response.status, 200);
      assert.equal(synced.body.created, 1);
      assert.equal(synced.body.results[0].event, "payment.dispute.won");

      const casesResponse = await json("/api/cases");
      const caseItem = casesResponse.body.find((item) => item.dispute_id === "disp_sync_won");
      assert.ok(caseItem);
      assert.equal(caseItem.status, "won");
      assert.equal(caseItem.packet_status, "closed");
    } finally {
      global.fetch = originalFetch;
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;
    }
  });

  it("exposes Razorpay-standard dispute fields and evidence mapping", async () => {
    const casesResponse = await json("/api/cases");
    const caseItem = casesResponse.body.find((item) => item.case_id === "PP-2026-0001");
    assert.ok(caseItem);
    assert.match(caseItem.dispute_id, /^disp_/);
    assert.equal(caseItem.reason_code, "goods_not_received");
    assert.equal(caseItem.reason_description, "Customer claims goods not received");
    assert.equal(caseItem.respond_by, "2026-09-03");
    assert.equal(caseItem.status, "open");
    assert.equal(caseItem.currency, "INR");
    assert.equal(typeof caseItem.amount_deducted, "number");

    const mapping = buildRazorpayEvidenceMapping(caseItem);
    assert.ok(mapping.required_rows.some((row) => row.evidence_key === "delivery proof" && row.razorpay_parameter === "shipping_proof"));
    assert.ok(mapping.required_rows.some((row) => row.evidence_key === "invoice" && row.razorpay_parameter === "billing_proof"));
  });

  it("blocks contest approval when required evidence is missing", async () => {
    const casesResponse = await json("/api/cases");
    const caseItem = casesResponse.body.find((item) => item.case_id === "PP-2026-0001");
    assert.ok(caseItem);

    const { response, body } = await json(`/api/cases/${caseItem.case_id}/decision`, {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" }),
    });

    assert.equal(response.status, 409);
    assert.match(body.error, /proof/i);
    assert.equal(body.failure_state, "NEEDS_MANUAL_REVIEW");
  });

  it("records reviewer reason for human decisions", async () => {
    const reason = "Delivery proof is incomplete, senior review required.";
    const decided = await json("/api/cases/PP-2026-0002/decision", {
      method: "PATCH",
      body: JSON.stringify({ status: "escalated", reason }),
    });

    assert.equal(decided.response.status, 200);
    assert.equal(decided.body.packet_status, "escalated");
    assert.ok(decided.body.audit_log.some((event) => event.action === "escalated" && event.detail.includes(reason)));
  });

  it("stores and downloads attached evidence through the backend", async () => {
    const content = "integration evidence proof";
    const payload = {
      evidenceKey: "delivery proof",
      fileName: "integration-delivery-proof.txt",
      mimeType: "text/plain",
      size: Buffer.byteLength(content),
      contentBase64: Buffer.from(content).toString("base64"),
    };

    let attached = await json("/api/cases/PP-2026-0001/evidence", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    assert.equal(attached.response.status, 200);
    assert.equal(attached.body.evidence_files["delivery proof"].file_name, payload.fileName);

    for (const evidenceKey of getRequired("goods_not_received").filter((key) => key !== "delivery proof")) {
      const proofContent = `integration proof for ${evidenceKey}`;
      attached = await json("/api/cases/PP-2026-0001/evidence", {
        method: "PATCH",
        body: JSON.stringify({
          evidenceKey,
          fileName: `${evidenceKey.replaceAll(" ", "-")}.txt`,
          mimeType: "text/plain",
          size: Buffer.byteLength(proofContent),
          contentBase64: Buffer.from(proofContent).toString("base64"),
        }),
      });
      assert.equal(attached.response.status, 200);
      assert.equal(attached.body.evidence_files[evidenceKey].file_name, `${evidenceKey.replaceAll(" ", "-")}.txt`);
    }

    assert.ok(attached.body.readiness_score >= 80);

    const download = await fetch(`${baseUrl}${attached.body.evidence_files["delivery proof"].download_url}`);
    assert.equal(download.status, 200);
    assert.equal(await download.text(), content);
    assert.match(download.headers.get("content-disposition"), /integration-delivery-proof\.txt/);

    const removed = await json("/api/cases/PP-2026-0001/evidence/delivery%20proof", {
      method: "DELETE",
    });
    assert.equal(removed.response.status, 200);
    assert.equal(removed.body.evidence_files["delivery proof"], undefined);
    assert.ok(removed.body.missing_evidence.includes("delivery proof"));
  });

  it("falls back safely when AI output is malformed or timed out", async () => {
    const malformed = await json("/api/ai/judgment/validate", {
      method: "POST",
      body: JSON.stringify({ raw_output: "{not-json" }),
    });
    const timeout = await withAiTimeout(() => new Promise(() => {}), 5);

    assert.equal(malformed.response.status, 200);
    assert.equal(malformed.body.fallback, true);
    assert.equal(malformed.body.reason, "AI_INVALID_JSON");
    assert.equal(malformed.body.judgment.requires_human_approval, true);
    assert.equal(malformed.body.judgment.safe_to_auto_submit, false);
    assert.equal(timeout.reason, "AI_TIMEOUT");
  });

  it("exposes judge-readable reliability proof for workflow, queue, and connectors", async () => {
    const reliability = await json("/api/reliability");
    assert.equal(reliability.response.status, 200);
    assert.equal(reliability.body.ok, true);

    const checks = new Map(reliability.body.checks.map((check) => [check.key, check]));
    assert.equal(checks.get("state_machine")?.status, "passing");
    assert.ok(checks.has("job_queue"));
    assert.ok(checks.has("evidence_connectors"));
    assert.ok(reliability.body.state_distribution);
    assert.ok(reliability.body.queue);
    assert.ok(Array.isArray(reliability.body.connector_status));
  });

  it("keeps evidence auto-collection safe when external connectors are not configured", async () => {
    const collection = await json("/api/cases/PP-2026-0001/auto-collect-evidence", {
      method: "POST",
      body: JSON.stringify({}),
    });

    assert.equal(collection.response.status, 200);
    assert.equal(collection.body.ok, true);
    assert.equal(collection.body.collection.connectors_run >= 1, true);
    assert.equal(collection.body.collection.connectors_configured, 0);
    assert.deepEqual(collection.body.collection.auto_available_evidence, []);
  });

  it("exports an honest production-readiness report for evaluators", async () => {
    const report = await json("/api/reliability/export");

    assert.equal(report.response.status, 200);
    assert.equal(report.body.ok, true);
    assert.equal(report.body.product, "ProofPilot AI");
    assert.ok(report.body.model);
    assert.ok(report.body.infrastructure);
    assert.ok(report.body.workflow_states);
    assert.ok(report.body.production_gaps_remaining.some((gap) => gap.includes("synthetic ML training data")));
  });
});
