import { EVIDENCE_LABELS, getRequired } from "./ruleEngine.js";
import { validateAiCaseJudgment } from "./aiGuardrails.js";

// ProofPilot Enhanced NLP AI Judgment Engine
// Rule-based with multi-signal extraction: intent, sentiment, urgency, entities.
// No external LLM API required — honest, deterministic, production-safe.

const INTENT_PATTERNS = [
  {
    intent: "unauthorized_transaction",
    terms: [
      "unauthorized", "fraud", "i did not authorize", "not my transaction",
      "card stolen", "someone else used", "hacked", "fraudulent charge",
      "not initiated by me", "did not make this payment",
    ],
  },
  {
    intent: "duplicate_payment",
    terms: [
      "charged twice", "duplicate", "two payments", "paid twice",
      "double charged", "charged again", "two deductions", "double deduction",
      "amount debited twice",
    ],
  },
  {
    intent: "refund_not_processed",
    terms: [
      "refund", "not received the money", "money back", "promised a refund",
      "refund pending", "refund not credited", "still waiting for refund",
      "refund not processed", "where is my refund", "when will i get refund",
    ],
  },
  {
    intent: "product_not_as_described",
    terms: [
      "wrong item", "damaged", "not as described", "different product",
      "defective", "broken", "poor quality", "fake product", "counterfeit",
      "not what i ordered", "totally different", "misrepresented",
    ],
  },
  {
    intent: "cancelled_subscription",
    terms: [
      "cancelled", "subscription", "renewal", "auto debit", "recurring",
      "auto pay", "cancelled my plan", "unsubscribed", "stopped subscription",
      "deactivated", "terminated plan",
    ],
  },
  {
    intent: "goods_not_received",
    terms: [
      "not received", "never received", "package missing", "not delivered",
      "didn't get", "order not arrived", "awaiting delivery", "still not here",
      "no delivery", "item not reached", "parcel missing",
    ],
  },
];

// Negative sentiment amplifiers — higher score = higher risk
const NEGATIVE_SENTIMENT_TERMS = [
  "terrible", "awful", "horrible", "disgusting", "fraud", "scam", "cheat",
  "steal", "robbery", "criminal", "pathetic", "useless", "worst", "rubbish",
  "cheated", "lied", "deceived", "unacceptable", "outrageous", "disgusted",
  "frustrated", "angry", "furious", "disgusting", "disappointed", "wasted",
  "lost money", "ripped off", "con", "fake",
];

// Urgency escalation signals
const URGENCY_TERMS = [
  "urgent", "urgently", "immediately", "asap", "right now", "right away",
  "emergency", "critical", "time sensitive", "legal action", "police",
  "consumer court", "rbi complaint", "nclt", "complaint", "escalate",
  "last warning", "final notice", "sue", "lawyer", "court",
  "will not wait", "must resolve today", "threatening",
];

// Monetary pattern
const AMOUNT_PATTERN = /(?:inr|rs\.?|₹)\s?[\d,]+(?:\.\d{1,2})?/gi;
// Tracking/order number pattern
const TRACKING_PATTERN = /\b(?:[A-Z]{2,4}\d{8,20}|[A-Z0-9]{10,20})\b/g;
// Date pattern
const DATE_PATTERN = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s\d{2,4})?)\b/gi;

function normalize(value) {
  return String(value || "").toLowerCase();
}

function findTerms(text, terms) {
  return terms.filter((term) => text.includes(term));
}

/**
 * Classify the primary dispute intent from complaint text.
 * Returns intent, confidence (48–96), and matched signal terms.
 */
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
    all_matches: matches.map((m) => ({ intent: m.intent, hit_count: m.hits.length })),
  };
}

/**
 * Score negative sentiment (0–1).
 * 0 = neutral, 1 = highly negative / hostile.
 */
export function sentimentScore(text = "") {
  const normalized = normalize(text);
  const hits = findTerms(normalized, NEGATIVE_SENTIMENT_TERMS);
  return Math.min(1, hits.length / 4);
}

/**
 * Detect urgency / legal threat signals (0–1).
 * 0 = no urgency, 1 = immediate legal/escalation threat.
 */
export function urgencyScore(text = "") {
  const normalized = normalize(text);
  const hits = findTerms(normalized, URGENCY_TERMS);
  // Legal threats are high urgency regardless of count
  const hasLegalThreat = hits.some((term) =>
    ["legal action", "police", "consumer court", "rbi complaint", "nclt", "lawyer", "court", "sue"].includes(term)
  );
  return Math.min(1, hasLegalThreat ? 0.9 + hits.length * 0.02 : hits.length * 0.2);
}

/**
 * Extract structured entities from complaint text.
 */
export function extractComplaintSignals(text = "") {
  const source = String(text || "");
  const normalized = normalize(source);

  const amounts = (source.match(AMOUNT_PATTERN) || []).map((amt) => amt.trim());
  const trackingNumbers = (source.match(TRACKING_PATTERN) || []).filter((code) => code.length >= 10);
  const dates = (source.match(DATE_PATTERN) || []).map((d) => d.trim());
  const sentiment = sentimentScore(source);
  const urgency = urgencyScore(source);

  return {
    amounts,
    dates,
    tracking_numbers: [...new Set(trackingNumbers)],
    refund_mention: normalized.includes("refund"),
    delivery_claim: normalized.includes("delivered") || normalized.includes("received") || normalized.includes("package"),
    fraud_claim: normalized.includes("fraud") || normalized.includes("unauthorized"),
    sentiment_score: Number(sentiment.toFixed(2)),
    urgency_score: Number(urgency.toFixed(2)),
    is_high_urgency: urgency >= 0.6,
    is_hostile: sentiment >= 0.5,
  };
}

function proofList(keys = []) {
  return keys.map((key) => EVIDENCE_LABELS[key] || key).join(", ");
}

/**
 * Draft a merchant response based on available evidence and recommended action.
 */
export function draftMerchantResponse(caseItem = {}) {
  const amount = Number(caseItem.amount || 0).toLocaleString("en-IN");
  const missing = caseItem.missing_evidence || [];
  const available = caseItem.available_evidence || [];
  const action = caseItem.recommended_action || "escalate";

  if (action === "contest") {
    return `We respectfully contest this dispute. Our records confirm payment ${caseItem.payment_id || "on file"} of INR ${amount}. The following evidence supports our position: ${proofList(available)}. This response packet has been reviewed and approved by our operations team before submission.`;
  }

  if (action === "accept") {
    return `We accept this dispute based on our review. The available evidence does not support contesting the claim at this time. We will process the appropriate refund or closure through the correct workflow after final reviewer approval.`;
  }

  return `We acknowledge the customer's claim. Before a final response can be issued safely, ProofPilot has identified missing evidence: ${proofList(missing)}. This case has been escalated to a human reviewer to collect the required proof or decide the appropriate next action.`;
}

/**
 * Build the full AI judgment for a case.
 * Returns a validated, schema-safe judgment object.
 */
export function buildAiJudgment(caseItem = {}) {
  const complaint = `${caseItem.customer_message || ""} ${caseItem.dispute_reason || ""}`;
  const classified = classifyComplaintIntent(complaint, caseItem.dispute_type);
  const extracted = extractComplaintSignals(complaint);
  const required = getRequired(caseItem.dispute_type);
  const missingEvidence = required.filter((key) => !(caseItem.available_evidence || []).includes(key));

  // Build enriched risk reasons combining model signals + NLP signals
  const riskReasons = [
    ...(caseItem.model_reasons || []),
    missingEvidence.length
      ? `Missing critical proof: ${proofList(missingEvidence.slice(0, 2))}`
      : "All required evidence is present",
    extracted.is_high_urgency ? "Customer signalled high urgency or legal threat" : null,
    extracted.is_hostile ? "Hostile/negative sentiment detected in complaint" : null,
    extracted.fraud_claim ? "Fraud or unauthorized transaction claimed" : null,
    caseItem.deadline ? `Response deadline: ${caseItem.deadline}` : null,
  ]
    .filter(Boolean)
    .slice(0, 6);

  return validateAiCaseJudgment({
    intent: classified.intent,
    confidence: classified.confidence,
    missing_evidence: missingEvidence,
    response_draft: draftMerchantResponse({ ...caseItem, missing_evidence: missingEvidence }),
    extracted_signals: extracted,
    risk_reasons: riskReasons,
    nlp_signals: {
      intent_matches: classified.all_matches,
      sentiment: extracted.sentiment_score,
      urgency: extracted.urgency_score,
      tracking_numbers: extracted.tracking_numbers,
      amounts_mentioned: extracted.amounts,
      dates_mentioned: extracted.dates,
    },
    engine: "enhanced-rule-based-nlp-v2",
    boundary: "Rule-based NLP + logistic regression risk model. No external LLM API. Human approval required for all decisions.",
  });
}
