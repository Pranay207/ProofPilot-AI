import { FAILURE_STATES } from "../../src/lib/workflow.js";
import { scoreCase } from "../../src/lib/ruleEngine.js";

export const READINESS_THRESHOLD = 80;
export const READINESS_BLOCK_MESSAGE = "Case readiness below required 80% threshold";

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

export function getCurrentReadiness(caseItem) {
  return Number(scoreCase(caseItem).readiness_score || 0);
}

export function ensureReadinessThreshold(caseItem) {
  if (getCurrentReadiness(caseItem) < READINESS_THRESHOLD) {
    const error = new Error(READINESS_BLOCK_MESSAGE);
    error.status = 422;
    error.failureState = FAILURE_STATES.NEEDS_MANUAL_REVIEW;
    throw error;
  }
}

export function ensureContestHasEvidence(caseItem, status) {
  const isContestApproval = status === "approved" || status === "contested";
  if (isContestApproval) ensureReadinessThreshold(caseItem);
}
