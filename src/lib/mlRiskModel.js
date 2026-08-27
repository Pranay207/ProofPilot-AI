import riskModelArtifact from "../model/riskModelArtifact.js";

const DISPUTE_BASE = {
  goods_not_received: 0.22,
  refund_not_processed: 0.18,
  duplicate_payment: 0.2,
  unauthorized_transaction: 0.34,
  product_not_as_described: 0.24,
  cancelled_subscription: 0.22,
};

const CRITICAL_EVIDENCE = {
  goods_not_received: ["delivery proof", "tracking snapshot"],
  refund_not_processed: ["refund id", "arn"],
  duplicate_payment: ["both payment receipts", "order mapping"],
  unauthorized_transaction: ["authorization proof", "risk check", "device fingerprint"],
  product_not_as_described: ["product description", "product photos", "merchant policy"],
  cancelled_subscription: ["subscription agreement", "cancellation log", "billing history"],
};

export const MODEL_CARD = riskModelArtifact;

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function daysUntil(dateValue) {
  if (!dateValue) return 14;
  const deadline = new Date(dateValue);
  if (Number.isNaN(deadline.getTime())) return 14;
  return Math.ceil((deadline.getTime() - Date.now()) / 86400000);
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

export function extractRiskFeatures(caseItem, required = []) {
  const amount = Number(caseItem.amount || 0);
  const available = new Set(caseItem.available_evidence || []);
  const missing = new Set(caseItem.missing_evidence || []);
  const type = caseItem.dispute_type;
  const complaint = `${caseItem.customer_message || ""} ${caseItem.dispute_reason || ""}`.toLowerCase();
  const critical = CRITICAL_EVIDENCE[type] || [];
  const criticalMissing = critical.filter((key) => missing.has(key)).length;
  const deadlineDays = daysUntil(caseItem.deadline);
  const missingRatio = required.length ? missing.size / required.length : 0;
  const statusBlob = `${caseItem.payment_status || ""} ${caseItem.refund_status || ""} ${caseItem.delivery_status || ""}`.toLowerCase();

  return {
    disputeBase: DISPUTE_BASE[type] ?? 0.18,
    amountLog: Math.min(1, Math.log10(Math.max(amount, 1)) / 5),
    missingRatio,
    criticalMissingRatio: critical.length ? criticalMissing / critical.length : 0,
    deadlineUrgency: deadlineDays <= 1 ? 1 : deadlineDays <= 3 ? 0.85 : deadlineDays <= 7 ? 0.55 : 0.15,
    statusMismatch: includesAny(statusBlob, ["no_proof", "promised", "not_applicable", "none"]) ? 1 : 0,
    complaintStrength: includesAny(complaint, ["never", "fraud", "unauthorized", "charged twice", "cancelled", "wrong", "damaged", "refund"]) ? 1 : 0.35,
    evidenceReady: required.length && required.every((key) => available.has(key)) ? 1 : 0,
  };
}

export function predictLossRisk(caseItem, required = []) {
  const features = extractRiskFeatures(caseItem, required);
  const logit = Object.entries(features).reduce(
    (sum, [key, value]) => sum + (MODEL_CARD.weights[key] || 0) * value,
    MODEL_CARD.bias,
  );
  const probability = sigmoid(logit);
  const score = Math.max(1, Math.min(100, Math.round(probability * 100)));
  return { score, probability, features };
}

export function explainLossRisk(features) {
  const items = [
    ["Dispute type risk", features.disputeBase],
    ["Missing evidence", features.missingRatio],
    ["Critical proof gaps", features.criticalMissingRatio],
    ["Deadline urgency", features.deadlineUrgency],
    ["Status mismatch", features.statusMismatch],
    ["Complaint signal", features.complaintStrength],
  ];
  return items
    .filter(([, value]) => value >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label]) => label);
}
