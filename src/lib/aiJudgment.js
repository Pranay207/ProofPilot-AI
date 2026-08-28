import { EVIDENCE_LABELS, getRequired } from "./ruleEngine.js";
import { validateAiCaseJudgment } from "./aiGuardrails.js";

const INTENT_PATTERNS = [
  {
    intent: "unauthorized_transaction",
    terms: ["unauthorized", "fraud", "i did not authorize", "not my transaction", "card stolen"],
  },
  {
    intent: "duplicate_payment",
    terms: ["charged twice", "duplicate", "two payments", "paid twice", "double charged"],
  },
  {
    intent: "refund_not_processed",
    terms: ["refund", "not received the money", "money back", "promised a refund", "refund pending"],
  },
  {
    intent: "product_not_as_described",
    terms: ["wrong item", "damaged", "not as described", "different product", "defective"],
  },
  {
    intent: "cancelled_subscription",
    terms: ["cancelled", "subscription", "renewal", "auto debit", "recurring"],
  },
  {
    intent: "goods_not_received",
    terms: ["not received", "never received", "package missing", "not delivered", "didn't get"],
  },
];

function normalize(value) {
  return String(value || "").toLowerCase();
}

function findTerms(text, terms) {
  return terms.filter((term) => text.includes(term));
}

export function classifyComplaintIntent(text = "", fallbackIntent = "goods_not_received") {
  const normalized = normalize(text);
  const matches = INTENT_PATTERNS
    .map((pattern) => ({ ...pattern, hits: findTerms(normalized, pattern.terms) }))
    .filter((pattern) => pattern.hits.length)
    .sort((a, b) => b.hits.length - a.hits.length);

  const best = matches[0];
  return {
    intent: best?.intent || fallbackIntent,
    confidence: best ? Math.min(96, 62 + best.hits.length * 12) : 48,
    signals: best?.hits || [],
  };
}

export function extractComplaintSignals(text = "") {
  const source = String(text || "");
  const normalized = normalize(source);
  const dates = source.match(/\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/gi) || [];
  const amounts = source.match(/(?:inr|rs\.?|₹)\s?\d[\d,]*/gi) || [];

  return {
    dates,
    amounts,
    refund_mention: normalized.includes("refund"),
    delivery_claim: normalized.includes("delivered") || normalized.includes("received") || normalized.includes("package"),
    fraud_claim: normalized.includes("fraud") || normalized.includes("unauthorized"),
  };
}

function proofList(keys = []) {
  return keys.map((key) => EVIDENCE_LABELS[key] || key).join(", ");
}

export function draftMerchantResponse(caseItem = {}) {
  const amount = Number(caseItem.amount || 0).toLocaleString("en-IN");
  const missing = caseItem.missing_evidence || [];
  const available = caseItem.available_evidence || [];
  const action = caseItem.recommended_action || "escalate";

  if (action === "contest") {
    return `We respectfully contest this dispute. Our records show payment ${caseItem.payment_id || "on file"} for INR ${amount}, and the required supporting evidence is available: ${proofList(available)}. The response packet is ready for reviewer approval before submission.`;
  }

  if (action === "accept") {
    return `We accept this dispute based on the current records. The available evidence does not support contesting the claim safely, and the case should be closed through the appropriate refund or loss-acceptance workflow after reviewer approval.`;
  }

  return `We acknowledge the customer's claim. ProofPilot found missing evidence before this case can be contested safely: ${proofList(missing)}. The case is escalated for a human reviewer to collect proof or decide the next action.`;
}

export function buildAiJudgment(caseItem = {}) {
  const complaint = `${caseItem.customer_message || ""} ${caseItem.dispute_reason || ""}`;
  const classified = classifyComplaintIntent(complaint, caseItem.dispute_type);
  const extracted = extractComplaintSignals(complaint);
  const required = getRequired(caseItem.dispute_type);
  const missingEvidence = required.filter((key) => !(caseItem.available_evidence || []).includes(key));
  const riskReasons = [
    ...(caseItem.model_reasons || []),
    missingEvidence.length ? `Missing ${proofList(missingEvidence.slice(0, 2))}` : "Required proof is present",
    caseItem.deadline ? `Deadline ${caseItem.deadline}` : "Deadline unavailable",
  ].slice(0, 5);

  return validateAiCaseJudgment({
    intent: classified.intent,
    confidence: classified.confidence,
    missing_evidence: missingEvidence,
    response_draft: draftMerchantResponse({ ...caseItem, missing_evidence: missingEvidence }),
    extracted_signals: extracted,
    risk_reasons: riskReasons,
  });
}
