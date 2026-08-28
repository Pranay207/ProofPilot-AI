export function buildCaseJudgmentPrompt(caseItem) {
  return {
    task: "Classify complaint intent, extract key signals, detect missing evidence, and draft a merchant reviewer response.",
    boundaries: [
      "Do not decide final refund outcome.",
      "Do not mutate ledgers.",
      "Do not submit disputes automatically.",
      "Return schema-valid JSON only.",
    ],
    case: {
      dispute_type: caseItem.dispute_type,
      amount: caseItem.amount,
      customer_message: caseItem.customer_message,
      payment_status: caseItem.payment_status,
      refund_status: caseItem.refund_status,
      delivery_status: caseItem.delivery_status,
      available_evidence: caseItem.available_evidence || [],
      missing_evidence: caseItem.missing_evidence || [],
    },
  };
}
