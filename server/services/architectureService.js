import { CASE_STATES, FAILURE_STATES } from "../../src/lib/workflow.js";
import { MODEL_CARD } from "../../src/lib/mlRiskModel.js";

export function buildArchitectureSummary() {
  return {
    ok: true,
    product: "ProofPilot AI",
    track: "AI Risk Manager",
    problem:
      "Merchants lose money when payment disputes arrive before invoice, delivery, refund, policy, and communication proof is organized.",
    workflow: [
      "Razorpay signed webhook or merchant-created case enters the backend.",
      "Webhook events are stored idempotently by payload hash before case creation.",
      "Risk scoring estimates dispute-loss probability from structured signals.",
      "Evidence service checks required proof by dispute type.",
      "AI classifies unstructured complaint text and drafts reviewer copy.",
      "Rules recommend contest, accept, or escalate.",
      "A human reviewer approves the final external action.",
      "Every mutation is written to the audit trail.",
    ],
    deterministic_states: Object.values(CASE_STATES),
    ai_does: [
      "classify complaint intent",
      "extract dates, amount mentions, refund claims, delivery claims, and fraud signals",
      "summarize risk reasons",
      "draft merchant response text",
      "detect missing evidence from notes and complaint text",
    ],
    ai_never_does: [
      "final refund decision",
      "financial amount calculation",
      "ledger mutation",
      "webhook validation",
      "automatic dispute submission",
    ],
    model_card: MODEL_CARD,
    failure_recovery: Object.values(FAILURE_STATES),
  };
}

