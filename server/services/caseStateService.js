import { buildWorkflowSnapshot } from "../../src/lib/workflow.js";

export function withCaseWorkflow(caseItem) {
  return {
    ...caseItem,
    workflow: buildWorkflowSnapshot(caseItem),
  };
}

export function requireDecisionStatus(status) {
  const allowedStatuses = new Set(["approved", "escalated", "accepted"]);
  if (!allowedStatuses.has(status)) {
    const error = new Error("Decision status must be approved, escalated, or accepted");
    error.status = 400;
    throw error;
  }
}
