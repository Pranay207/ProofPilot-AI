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

let server;
let baseUrl;

function sign(body) {
  return crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
}

function disputePayload(id = "disp_integration_001") {
  return {
    event: "payment.dispute.created",
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
          status: "open",
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
