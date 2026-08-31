import { FAILURE_STATES } from "../../src/lib/workflow.js";

// Valid human decision statuses that can be set via the PATCH /api/cases/:id/decision endpoint
const ALLOWED_DECISION_STATUSES = new Set(["approved", "escalated", "accepted", "contested", "closed"]);

export function validateDecisionStatus(status) {
  if (!ALLOWED_DECISION_STATUSES.has(status)) {
    const error = new Error("Decision status must be: approved, escalated, accepted, contested, or closed");
    error.status = 400;
    error.failureState = FAILURE_STATES.PAYLOAD_INCOMPLETE;
    throw error;
  }
}

export function ensureContestHasEvidence(caseItem, status) {
  const isContestApproval = status === "approved" || status === "contested";
  if (isContestApproval && Number(caseItem.readiness_score || 0) < 80) {
    const error = new Error(
      "Contest approval blocked: required proof readiness must reach 80% before contesting. Upload missing evidence or escalate for human review."
    );
    error.status = 409;
    error.failureState = FAILURE_STATES.NEEDS_MANUAL_REVIEW;
    throw error;
  }
}
