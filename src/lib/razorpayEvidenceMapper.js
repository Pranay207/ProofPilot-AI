import { EVIDENCE_LABELS, getRequired, hasEvidence } from "./ruleEngine.js";

export const RAZORPAY_EVIDENCE_FIELDS = {
  invoice: "billing_proof",
  "payment receipt": "billing_proof",
  "both payment receipts": "billing_proof",
  "delivery proof": "shipping_proof",
  "tracking snapshot": "shipping_proof",
  "customer communication": "customer_communication",
  "policy snapshot": "refund_cancellation_policy",
  "refund policy": "refund_cancellation_policy",
  "refund id": "refund_confirmation",
  arn: "refund_confirmation",
  "refund proof": "refund_confirmation",
  "refund status": "refund_confirmation",
  "authorization proof": "explanation_letter",
  "risk check": "access_activity_log",
  "device fingerprint": "access_activity_log",
  "customer identity": "billing_proof",
  "product description": "billing_proof",
  "product photos": "shipping_proof",
  "delivery condition proof": "shipping_proof",
  "return inspection": "shipping_proof",
  "merchant policy": "refund_cancellation_policy",
  "subscription agreement": "term_and_conditions",
  "cancellation log": "cancellation_proof",
  "billing history": "billing_proof",
  "service usage logs": "proof_of_service",
  "renewal notice": "term_and_conditions",
};

export const RAZORPAY_EVIDENCE_LABELS = {
  shipping_proof: "Shipping Receipt / Tracking Link",
  billing_proof: "Invoice / Payment Receipt",
  refund_confirmation: "Refund ARN / Proof of Credit",
  customer_communication: "Customer Support Logs / Email Thread",
  refund_cancellation_policy: "Store Policy Snapshot",
  term_and_conditions: "Terms and Conditions",
  cancellation_proof: "Cancellation Proof",
  proof_of_service: "Proof of Service",
  explanation_letter: "Explanation Letter",
  access_activity_log: "Access Activity Log",
};

export function getRazorpayEvidenceParam(evidenceKey) {
  return RAZORPAY_EVIDENCE_FIELDS[evidenceKey] || "others";
}

export function buildRazorpayEvidenceMapping(caseItem = {}) {
  const required = getRequired(caseItem.dispute_type);
  const evidenceFiles = caseItem.evidence_files || {};
  const requiredRows = required.map((key) => {
    const parameter = getRazorpayEvidenceParam(key);
    const file = evidenceFiles[key];
    return {
      evidence_key: key,
      label: EVIDENCE_LABELS[key] || key,
      razorpay_parameter: parameter,
      razorpay_label: RAZORPAY_EVIDENCE_LABELS[parameter] || "Other Evidence",
      attached: hasEvidence(caseItem, key),
      file,
    };
  });
  const requiredParameters = [...new Set(requiredRows.map((row) => row.razorpay_parameter))];
  const mappedParameters = [...new Set(requiredRows.filter((row) => row.attached).map((row) => row.razorpay_parameter))];

  return {
    required_rows: requiredRows,
    required_parameter_count: requiredParameters.length,
    mapped_parameter_count: mappedParameters.length,
    required_parameters: requiredParameters,
    mapped_parameters: mappedParameters,
    ready: requiredParameters.length > 0 && requiredParameters.length === mappedParameters.length,
  };
}
