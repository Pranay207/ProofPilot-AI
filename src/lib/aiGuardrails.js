const FALLBACK_DRAFT =
  "We acknowledge the customer claim. Our team is reviewing payment, refund, fulfilment, communication, and policy evidence before taking a final action. This response is held for human review.";

const ALLOWED_INTENTS = new Set([
  "goods_not_received",
  "refund_not_processed",
  "duplicate_payment",
  "unauthorized_transaction",
  "product_not_as_described",
  "cancelled_subscription",
  "unknown",
]);

export function safeParseAiJson(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, fallback: true, reason: "AI_INVALID_JSON" };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, fallback: true, reason: "AI_INVALID_JSON" };
  }
}

export function validateAiCaseJudgment(rawJudgment = {}) {
  const intent = ALLOWED_INTENTS.has(rawJudgment.intent) ? rawJudgment.intent : "unknown";
  const confidence = Number(rawJudgment.confidence);
  const safeConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : 0;
  const missingEvidence = Array.isArray(rawJudgment.missing_evidence)
    ? rawJudgment.missing_evidence.filter((item) => typeof item === "string")
    : [];
  const responseDraft = typeof rawJudgment.response_draft === "string" && rawJudgment.response_draft.trim()
    ? rawJudgment.response_draft.trim()
    : FALLBACK_DRAFT;

  return {
    intent,
    confidence: safeConfidence,
    missing_evidence: missingEvidence,
    response_draft: responseDraft,
    safe_to_auto_submit: false,
    requires_human_approval: true,
  };
}

export async function withAiTimeout(task, timeoutMs = 3500) {
  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, fallback: true, reason: "AI_TIMEOUT" }), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function buildFallbackAiJudgment(caseItem = {}, reason = "AI_FALLBACK") {
  return {
    ok: false,
    fallback: true,
    reason,
    judgment: validateAiCaseJudgment({
      intent: caseItem.dispute_type || "unknown",
      confidence: 0,
      missing_evidence: caseItem.missing_evidence || [],
      response_draft: caseItem.merchant_response_draft || FALLBACK_DRAFT,
    }),
  };
}
