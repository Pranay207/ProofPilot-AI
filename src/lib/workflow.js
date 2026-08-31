// ProofPilot formal case lifecycle state machine.
// Full lifecycle: NEW_SIGNAL → NEEDS_PROOF → PROOF_READY → DRAFT_READY
//                → AWAITING_APPROVAL → APPROVED_TO_CONTEST → CONTESTED/ACCEPTED_LOSS → CLOSED

export const CASE_STATES = {
  NEW_SIGNAL: "NEW_SIGNAL",           // Case just created from webhook, no scoring yet
  NEEDS_PROOF: "NEEDS_PROOF",         // Readiness < 80%, evidence collection required
  PROOF_READY: "PROOF_READY",         // Readiness >= 80%, ready to draft response
  DRAFT_READY: "DRAFT_READY",         // Response draft exists, awaiting human review
  AWAITING_APPROVAL: "AWAITING_APPROVAL", // In reviewer's queue for final decision
  APPROVED_TO_CONTEST: "APPROVED_TO_CONTEST", // Human approved, ready for Razorpay submission
  CONTESTED: "CONTESTED",             // Dispute submitted to Razorpay for contest
  ACCEPTED_LOSS: "ACCEPTED_LOSS",     // Human decided to accept the dispute loss
  ESCALATED: "ESCALATED",             // Routed to senior reviewer / manual process
  CLOSED: "CLOSED",                   // Case fully closed (either contested or accepted)
};

export const FAILURE_STATES = {
  AI_TIMEOUT: "AI_TIMEOUT",
  AI_INVALID_JSON: "AI_INVALID_JSON",
  WEBHOOK_DUPLICATE: "WEBHOOK_DUPLICATE",
  WEBHOOK_SIGNATURE_FAILED: "WEBHOOK_SIGNATURE_FAILED",
  PAYLOAD_INCOMPLETE: "PAYLOAD_INCOMPLETE",
  DB_WRITE_FAILED: "DB_WRITE_FAILED",
  NEEDS_MANUAL_REVIEW: "NEEDS_MANUAL_REVIEW",
  CONTEST_SUBMITTED: "CONTEST_SUBMITTED",
  CASE_CLOSED: "CASE_CLOSED",
};

/**
 * Derive the current formal workflow state from a case object.
 * Deterministic — same inputs always produce the same state.
 */
export function deriveCaseState(caseItem = {}) {
  const packetStatus = caseItem.packet_status || caseItem.packetStatus || "draft";
  const readiness = Number(caseItem.readiness_score || 0);
  const hasDraft = Boolean((caseItem.merchant_response_draft || caseItem.merchantResponseDraft || "").trim());
  const hasPaymentId = Boolean(caseItem.payment_id || caseItem.paymentId);
  const hasDisputeId = Boolean(caseItem.dispute_id || caseItem.disputeId);

  // Terminal / final states
  if (packetStatus === "closed") return CASE_STATES.CLOSED;
  if (packetStatus === "contested") return CASE_STATES.CONTESTED;
  if (packetStatus === "accepted") return CASE_STATES.ACCEPTED_LOSS;
  if (packetStatus === "escalated") return CASE_STATES.ESCALATED;
  if (packetStatus === "approved") return CASE_STATES.APPROVED_TO_CONTEST;

  // Active workflow states (packet_status = "draft")
  if (!hasPaymentId || !hasDisputeId) return CASE_STATES.NEW_SIGNAL;
  if (readiness < 80) return CASE_STATES.NEEDS_PROOF;
  if (!hasDraft) return CASE_STATES.PROOF_READY;
  if (readiness >= 80 && hasDraft) {
    // DRAFT_READY → AWAITING_APPROVAL once it has timeline events indicating review submission
    const hasReviewEvent = (caseItem.timeline_events || caseItem.timelineEvents || [])
      .some((event) => {
        const evt = event.event || "";
        return evt.includes("review") || evt.includes("approval") || evt.includes("submitted_for_review");
      });
    if (hasReviewEvent) return CASE_STATES.AWAITING_APPROVAL;
    return CASE_STATES.DRAFT_READY;
  }

  return CASE_STATES.AWAITING_APPROVAL;
}

/**
 * What should the operator do next given the current state?
 */
export function getNextSafeAction(caseItem = {}) {
  const state = deriveCaseState(caseItem);
  const MAP = {
    [CASE_STATES.NEW_SIGNAL]: "Verify payment and dispute IDs are linked correctly.",
    [CASE_STATES.NEEDS_PROOF]: "Collect missing evidence before contesting — use auto-collect or upload manually.",
    [CASE_STATES.PROOF_READY]: "Generate or review response draft before routing for approval.",
    [CASE_STATES.DRAFT_READY]: "Submit draft for human review and approval.",
    [CASE_STATES.AWAITING_APPROVAL]: "Reviewer must approve, edit, escalate, or accept the draft.",
    [CASE_STATES.APPROVED_TO_CONTEST]: "Export packet and submit to Razorpay via the dispute submission endpoint.",
    [CASE_STATES.CONTESTED]: "Await Razorpay adjudication. Monitor for outcome webhook.",
    [CASE_STATES.ACCEPTED_LOSS]: "Process refund or closure outside ProofPilot. Audit trail retained.",
    [CASE_STATES.ESCALATED]: "Route to senior risk or operations reviewer for manual decision.",
    [CASE_STATES.CLOSED]: "Case fully closed. No further action required.",
  };
  return MAP[state] || "Review case status and take appropriate action.";
}

/**
 * Which state transitions are valid from the current state?
 */
export function getValidTransitions(currentState) {
  const TRANSITIONS = {
    [CASE_STATES.NEW_SIGNAL]: [CASE_STATES.NEEDS_PROOF, CASE_STATES.PROOF_READY],
    [CASE_STATES.NEEDS_PROOF]: [CASE_STATES.PROOF_READY, CASE_STATES.ESCALATED],
    [CASE_STATES.PROOF_READY]: [CASE_STATES.DRAFT_READY, CASE_STATES.ESCALATED],
    [CASE_STATES.DRAFT_READY]: [CASE_STATES.AWAITING_APPROVAL, CASE_STATES.ESCALATED],
    [CASE_STATES.AWAITING_APPROVAL]: [
      CASE_STATES.APPROVED_TO_CONTEST,
      CASE_STATES.ACCEPTED_LOSS,
      CASE_STATES.ESCALATED,
    ],
    [CASE_STATES.APPROVED_TO_CONTEST]: [CASE_STATES.CONTESTED, CASE_STATES.ESCALATED],
    [CASE_STATES.CONTESTED]: [CASE_STATES.CLOSED],
    [CASE_STATES.ACCEPTED_LOSS]: [CASE_STATES.CLOSED],
    [CASE_STATES.ESCALATED]: [
      CASE_STATES.AWAITING_APPROVAL,
      CASE_STATES.ACCEPTED_LOSS,
      CASE_STATES.CLOSED,
    ],
    [CASE_STATES.CLOSED]: [],
  };
  return TRANSITIONS[currentState] || [];
}

/**
 * Build a complete workflow snapshot for a case (used in API responses).
 */
export function buildWorkflowSnapshot(caseItem = {}) {
  const state = deriveCaseState(caseItem);
  return {
    state,
    next_safe_action: getNextSafeAction(caseItem),
    valid_transitions: getValidTransitions(state),
    ai_boundary: "AI classifies, summarizes, and drafts only. Rules recommend. Humans approve final action.",
    external_action_allowed: [
      CASE_STATES.APPROVED_TO_CONTEST,
      CASE_STATES.ACCEPTED_LOSS,
      CASE_STATES.ESCALATED,
      CASE_STATES.CONTESTED,
    ].includes(state),
    is_terminal: [CASE_STATES.CLOSED, CASE_STATES.CONTESTED, CASE_STATES.ACCEPTED_LOSS].includes(state),
  };
}
