import { explainLossRisk, predictLossRisk } from "./mlRiskModel.js";

// Hybrid decision engine for ProofPilot AI.
// Risk uses a trained logistic loss-probability model plus deterministic guardrails.
// Readiness and final actions use deterministic guardrails.

export const EVIDENCE_LABELS = {
  "invoice": "Invoice",
  "delivery proof": "Delivery proof",
  "tracking snapshot": "Tracking snapshot",
  "customer communication": "Customer communication",
  "policy snapshot": "Policy snapshot",
  "payment receipt": "Payment receipt",
  "refund id": "Refund ID",
  "arn": "ARN / RRN / UTR",
  "refund policy": "Refund policy",
  "refund proof": "Refund proof",
  "both payment receipts": "Both payment receipts",
  "order mapping": "Order mapping",
  "timestamps": "Timestamps",
  "refund status": "Refund status",
  "authorization proof": "Authorization proof",
  "risk check": "Risk check",
  "device fingerprint": "Device / IP fingerprint",
  "customer identity": "Customer identity",
  "usage proof": "Usage / login proof",
  "product description": "Product description",
  "product photos": "Product photos",
  "delivery condition proof": "Delivery condition proof",
  "return inspection": "Return inspection",
  "merchant policy": "Merchant policy",
  "subscription agreement": "Subscription agreement",
  "cancellation log": "Cancellation log",
  "billing history": "Billing history",
  "service usage logs": "Service usage logs",
  "renewal notice": "Renewal notice",
};

// Required evidence checklist per dispute type.
export const REQUIRED_EVIDENCE = {
  goods_not_received: ["invoice", "delivery proof", "tracking snapshot", "customer communication", "policy snapshot"],
  refund_not_processed: ["payment receipt", "refund id", "arn", "refund policy", "customer communication"],
  duplicate_payment: ["both payment receipts", "order mapping", "timestamps", "refund status"],
  unauthorized_transaction: ["payment receipt", "authorization proof", "risk check", "device fingerprint", "customer identity"],
  product_not_as_described: ["invoice", "product description", "product photos", "delivery condition proof", "customer communication", "merchant policy"],
  cancelled_subscription: ["subscription agreement", "cancellation log", "billing history", "service usage logs", "renewal notice"],
};

export function getRequired(disputeType) {
  return REQUIRED_EVIDENCE[disputeType] || [];
}

export function hasEvidence(caseItem, key) {
  return caseItem.available_evidence?.some((e) => e.toLowerCase() === key.toLowerCase());
}

// Recompute readiness from evidence coverage.
export function computeReadiness(caseItem) {
  const required = getRequired(caseItem.dispute_type);
  if (!required.length) return caseItem.confidence_score || 0;
  const have = required.filter((k) => hasEvidence(caseItem, k)).length;
  return Math.round((have / required.length) * 100);
}

function clampScore(score) {
  return Math.max(1, Math.min(100, Math.round(score)));
}

function clampRiskScore(score) {
  return Math.max(1, Math.min(98, Math.round(score)));
}

function daysUntil(dateValue) {
  if (!dateValue) return 14;
  const deadline = new Date(dateValue);
  if (Number.isNaN(deadline.getTime())) return 14;
  return Math.ceil((deadline.getTime() - Date.now()) / 86400000);
}

export function computeRiskScore(caseItem) {
  const type = caseItem.dispute_type;
  const amount = Number(caseItem.amount || 0);
  const missing = new Set(caseItem.missing_evidence || []);
  const complaint = `${caseItem.customer_message || ""} ${caseItem.dispute_reason || ""}`.toLowerCase();
  const deadlineDays = daysUntil(caseItem.deadline);
  const model = predictLossRisk(caseItem, getRequired(type));
  let score = model.score;
  score += {
    goods_not_received: 45,
    refund_not_processed: 40,
    duplicate_payment: 42,
    unauthorized_transaction: 58,
    product_not_as_described: 46,
    cancelled_subscription: 44,
  }[type] ? 0 : 5;

  if (amount >= 10000) score += 3;
  else if (amount >= 3000) score += 2;
  else if (amount >= 1000) score += 1;

  if (deadlineDays <= 1) score += 3;
  else if (deadlineDays <= 3) score += 2;
  else if (deadlineDays <= 7) score += 1;

  if (type === "goods_not_received") {
    if (missing.has("delivery proof")) score += 3;
    if (missing.has("tracking snapshot")) score += 2;
    if ((caseItem.delivery_status || "").includes("no_proof")) score += 2;
    if (complaint.includes("never received") || complaint.includes("not received")) score += 1;
  }

  if (type === "refund_not_processed") {
    if (missing.has("arn")) score += 3;
    if (missing.has("refund id") || missing.has("refund proof")) score += 3;
    if ((caseItem.refund_status || "").includes("promised")) score += 2;
    if (complaint.includes("refund")) score += 1;
  }

  if (type === "duplicate_payment") {
    if (missing.has("order mapping")) score += 3;
    if (missing.has("both payment receipts")) score += 2;
    if ((caseItem.case_summary || "").toLowerCase().includes("confirmed duplicate")) score += 2;
    if (complaint.includes("charged twice") || complaint.includes("duplicate")) score += 1;
  }

  if (type === "unauthorized_transaction") {
    if (missing.has("authorization proof")) score += 3;
    if (missing.has("risk check")) score += 3;
    if (missing.has("device fingerprint")) score += 2;
    if (complaint.includes("unauthorized") || complaint.includes("fraud")) score += 2;
  }

  if (type === "product_not_as_described") {
    if (missing.has("product description")) score += 3;
    if (missing.has("product photos")) score += 2;
    if (missing.has("return inspection")) score += 2;
    if (complaint.includes("wrong") || complaint.includes("damaged") || complaint.includes("not as described")) score += 1;
  }

  if (type === "cancelled_subscription") {
    if (missing.has("cancellation log")) score += 3;
    if (missing.has("subscription agreement")) score += 2;
    if (missing.has("billing history")) score += 2;
    if (complaint.includes("cancelled") || complaint.includes("subscription")) score += 1;
  }

  return clampRiskScore(score);
}

export function computeConfidenceScore(caseItem) {
  const readiness = computeReadiness(caseItem);
  const hasIds = Boolean(caseItem.payment_id && caseItem.order_id && caseItem.dispute_id);
  const hasComplaint = Boolean((caseItem.customer_message || "").trim());
  const hasTimeline = (caseItem.timeline_events || []).length >= 2;
  const type = caseItem.dispute_type;
  let score = 30 + readiness * 0.35;

  if (hasIds) score += 12;
  if (hasComplaint) score += 8;
  if (hasTimeline) score += 8;
  if (getRequired(type).length) score += 6;

  if (type === "goods_not_received" && hasEvidence(caseItem, "delivery proof")) score += 10;
  if (type === "goods_not_received" && !hasEvidence(caseItem, "delivery proof")) score -= 8;
  if (type === "refund_not_processed" && (caseItem.arn || hasEvidence(caseItem, "arn"))) score += 8;
  if (type === "refund_not_processed" && !(caseItem.arn || hasEvidence(caseItem, "arn"))) score -= 6;
  if (type === "duplicate_payment" && hasEvidence(caseItem, "order mapping")) score += 8;
  if (type === "unauthorized_transaction" && hasEvidence(caseItem, "authorization proof") && hasEvidence(caseItem, "risk check")) score += 10;
  if (type === "unauthorized_transaction" && !hasEvidence(caseItem, "authorization proof")) score -= 8;
  if (type === "product_not_as_described" && hasEvidence(caseItem, "product description") && hasEvidence(caseItem, "product photos")) score += 8;
  if (type === "product_not_as_described" && !hasEvidence(caseItem, "product description")) score -= 6;
  if (type === "cancelled_subscription" && hasEvidence(caseItem, "cancellation log")) score += 8;
  if (type === "cancelled_subscription" && !hasEvidence(caseItem, "cancellation log")) score -= 8;

  return clampScore(score);
}

export function scoreCase(caseItem) {
  const readiness = computeReadiness(caseItem);
  const confidence = computeConfidenceScore({ ...caseItem, readiness_score: readiness });
  const risk = computeRiskScore({ ...caseItem, readiness_score: readiness, confidence_score: confidence });
  const model = predictLossRisk({ ...caseItem, readiness_score: readiness, confidence_score: confidence }, getRequired(caseItem.dispute_type));
  const decision = recommend({ ...caseItem, readiness_score: readiness, confidence_score: confidence, risk_score: risk });
  return {
    risk_score: risk,
    readiness_score: readiness,
    confidence_score: confidence,
    model_probability: Math.round(model.probability * 100),
    model_reasons: explainLossRisk(model.features),
    recommended_action: decision.action,
    action_reason: decision.reason,
  };
}

// Core decision rules.
export function recommend(caseItem) {
  const confidence = caseItem.confidence_score ?? 0;
  const type = caseItem.dispute_type;

  // Rule: confidence below 70% -> escalate to human.
  if (confidence < 70) {
    return { action: "escalate", reason: "Confidence below 70% - escalate to human review." };
  }

  if (type === "goods_not_received") {
    if (hasEvidence(caseItem, "delivery proof")) {
      return { action: "contest", reason: "Goods not received claim but delivery proof exists - contest." };
    }
    return { action: "escalate", reason: "Goods not received and delivery proof missing - escalate." };
  }

  if (type === "refund_not_processed") {
    const hasArn = caseItem.arn || hasEvidence(caseItem, "arn");
    const hasRefundId = caseItem.refund_id || hasEvidence(caseItem, "refund id") || hasEvidence(caseItem, "refund proof");
    if (hasArn && hasRefundId) {
      return { action: "contest", reason: "Refund processed with ARN + refund ID on record - contest/explain." };
    }
    return { action: "accept", reason: "No refund proof / ARN but merchant promised refund - accept/refund." };
  }

  if (type === "duplicate_payment") {
    const confirmed = (caseItem.case_summary || "").toLowerCase().includes("confirmed duplicate");
    if (confirmed) {
      return { action: "accept", reason: "Duplicate payment confirmed (same customer, amount, order) - accept/refund." };
    }
    return { action: "contest", reason: "Two separate orders - duplicate claim not confirmed - contest." };
  }

  if (type === "unauthorized_transaction") {
    if (hasEvidence(caseItem, "authorization proof") && hasEvidence(caseItem, "risk check") && hasEvidence(caseItem, "device fingerprint")) {
      return { action: "contest", reason: "Authorization, risk checks, and device proof are available - contest." };
    }
    return { action: "escalate", reason: "Unauthorized claim needs authorization and device proof before contesting." };
  }

  if (type === "product_not_as_described") {
    if (hasEvidence(caseItem, "product description") && hasEvidence(caseItem, "product photos") && hasEvidence(caseItem, "merchant policy")) {
      return { action: "contest", reason: "Catalog, product condition, and policy proof support merchant position - contest." };
    }
    return { action: "escalate", reason: "Product-quality claim needs catalog, photo, and policy proof before contesting." };
  }

  if (type === "cancelled_subscription") {
    if (hasEvidence(caseItem, "cancellation log")) {
      return { action: "accept", reason: "Cancellation proof exists before renewal charge - accept/refund." };
    }
    if (hasEvidence(caseItem, "subscription agreement") && hasEvidence(caseItem, "billing history") && hasEvidence(caseItem, "renewal notice")) {
      return { action: "contest", reason: "Subscription agreement, billing history, and renewal notice support the charge - contest." };
    }
    return { action: "escalate", reason: "Subscription dispute needs cancellation and billing proof before decision." };
  }

  return { action: "escalate", reason: "Unrecognized case - escalate to human." };
}

export function actionTone(action) {
  if (action === "contest") return { color: "emerald", label: "Contest" };
  if (action === "accept") return { color: "amber", label: "Accept / Refund" };
  return { color: "red", label: "Escalate" };
}

export function riskTone(score) {
  if (score >= 75) return { color: "red", label: "High" };
  if (score >= 50) return { color: "amber", label: "Medium" };
  return { color: "emerald", label: "Low" };
}

export function readinessTone(score) {
  if (score >= 80) return { color: "emerald", label: "Ready" };
  if (score >= 50) return { color: "amber", label: "Partial" };
  return { color: "red", label: "Not ready" };
}
