export const CASE_STATES = {
  NEW_SIGNAL: "NEW_SIGNAL",
  NEEDS_PROOF: "NEEDS_PROOF",
  PROOF_READY: "PROOF_READY",
  DRAFT_READY: "DRAFT_READY",
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  APPROVED_TO_CONTEST: "APPROVED_TO_CONTEST",
  ACCEPTED_LOSS: "ACCEPTED_LOSS",
  ESCALATED: "ESCALATED",
  CLOSED: "CLOSED",
};

export const FAILURE_STATES = {
  AI_TIMEOUT: "AI_TIMEOUT",
  AI_INVALID_JSON: "AI_INVALID_JSON",
  WEBHOOK_DUPLICATE: "WEBHOOK_DUPLICATE",
  WEBHOOK_SIGNATURE_FAILED: "WEBHOOK_SIGNATURE_FAILED",
  PAYLOAD_INCOMPLETE: "PAYLOAD_INCOMPLETE",
  DB_WRITE_FAILED: "DB_WRITE_FAILED",
  NEEDS_MANUAL_REVIEW: "NEEDS_MANUAL_REVIEW",
};

export function deriveCaseState(caseItem = {}) {
  if (caseItem.packet_status === "approved") return CASE_STATES.APPROVED_TO_CONTEST;
  if (caseItem.packet_status === "accepted") return CASE_STATES.ACCEPTED_LOSS;
  if (caseItem.packet_status === "escalated") return CASE_STATES.ESCALATED;
  if ((caseItem.readiness_score || 0) < 80) return CASE_STATES.NEEDS_PROOF;
  if (!caseItem.merchant_response_draft) return CASE_STATES.PROOF_READY;
  return CASE_STATES.AWAITING_APPROVAL;
}

export function getNextSafeAction(caseItem = {}) {
  const state = deriveCaseState(caseItem);
  if (state === CASE_STATES.NEEDS_PROOF) return "Collect missing proof before contesting.";
  if (state === CASE_STATES.AWAITING_APPROVAL) return "Reviewer must approve, edit, escalate, or accept.";
  if (state === CASE_STATES.APPROVED_TO_CONTEST) return "Export packet for dispute submission.";
  if (state === CASE_STATES.ACCEPTED_LOSS) return "Process refund/closure outside ProofPilot with audit trail.";
  if (state === CASE_STATES.ESCALATED) return "Route to senior risk or operations reviewer.";
  return "Create response draft and route for review.";
}

export function buildWorkflowSnapshot(caseItem = {}) {
  return {
    state: deriveCaseState(caseItem),
    next_safe_action: getNextSafeAction(caseItem),
    ai_boundary: "AI classifies, summarizes, and drafts only. Rules recommend. Humans approve final action.",
    external_action_allowed: ["approved", "accepted", "escalated"].includes(caseItem.packet_status),
  };
}
