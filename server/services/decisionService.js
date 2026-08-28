import { FAILURE_STATES } from "../../src/lib/workflow.js";

const ALLOWED_DECISION_STATUSES = new Set(["approved", "escalated", "accepted"]);

export function validateDecisionStatus(status) {
  if (!ALLOWED_DECISION_STATUSES.has(status)) {
    const error = new Error("Decision status must be approved, escalated, or accepted");
    error.status = 400;
    error.failureState = FAILURE_STATES.PAYLOAD_INCOMPLETE;
    throw error;
  }
}

export function ensureContestHasEvidence(caseItem, status) {
  const isContestApproval = status === "approved" && caseItem.recommended_action === "contest";
  if (isContestApproval && Number(caseItem.readiness_score || 0) < 80) {
    const error = new Error("Contest approval blocked until required proof is attached or reviewer escalates.");
    error.status = 409;
    error.failureState = FAILURE_STATES.NEEDS_MANUAL_REVIEW;
    throw error;
  }
}
