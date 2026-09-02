// Synthetic Razorpay-style seed data for ProofPilot AI.
function deriveDisputeStatus(packetStatus) {
  if (packetStatus === "approved" || packetStatus === "contested") return "under_review";
  if (packetStatus === "accepted") return "lost";
  if (packetStatus === "closed") return "closed";
  return "open";
}

function withRazorpayFields(caseItem) {
  const disputeId = caseItem.dispute_id || `disp_${caseItem.case_id.replace(/\D/g, "").slice(-8) || "sample"}`;
  return {
    ...caseItem,
    dispute_id: disputeId.replace(/^dsp_/, "disp_"),
    amount_deducted: caseItem.amount_deducted || 0,
    reason_code: caseItem.reason_code || caseItem.dispute_type,
    reason_description: caseItem.reason_description || caseItem.dispute_reason,
    respond_by: caseItem.respond_by || caseItem.deadline,
    status: caseItem.status || deriveDisputeStatus(caseItem.packet_status),
  };
}

export const SAMPLE_CASES = [
  {
    case_id: "PP-2026-0001",
    payment_id: "pay_Nx9Q2kAbCdEfGh",
    order_id: "ord_8801GoodsNotRecv",
    dispute_id: "disp_5501",
    refund_id: "",
    arn: "",
    rrn: "",
    utr: "",
    customer_name: "Aarav Mehta",
    customer_email: "aarav.mehta@example.in",
    amount: 4299,
    currency: "INR",
    payment_status: "captured",
    refund_status: "none",
    delivery_status: "shipped_no_proof",
    dispute_type: "goods_not_received",
    dispute_reason: "Customer claims goods not received",
    risk_score: 82,
    readiness_score: 60,
    confidence_score: 64,
    customer_message: "I never received my order even though it shows shipped. I want a refund.",
    case_summary: "Customer claims non-receipt of a INR 4,299 order. Shipment was initiated but no delivery proof / POD is on file. Dispute window open.",
    available_evidence: ["invoice", "customer communication", "policy snapshot"],
    missing_evidence: ["delivery proof", "tracking snapshot"],
    timeline_events: [
      { event: "payment.captured", timestamp: "2026-08-10T09:14:00Z", status: "ok", detail: "INR 4,299 captured | pay_Nx9Q2kAbCdEfGh" },
      { event: "order shipped", timestamp: "2026-08-11T12:30:00Z", status: "ok", detail: "Forwarded to courier, no POD captured" },
      { event: "customer complained", timestamp: "2026-08-18T08:02:00Z", status: "warn", detail: "Non-receipt claim via support" },
      { event: "payment.dispute.created", timestamp: "2026-08-20T11:45:00Z", status: "alert", detail: "disp_5501 raised | goods not received" },
      { event: "evidence due", timestamp: "2026-08-20T11:46:00Z", status: "alert", detail: "Delivery proof needed before deadline" }
    ],
    recommended_action: "escalate",
    action_reason: "Confidence below 70% and delivery proof missing - escalate.",
    deadline: "2026-09-03",
    owner: "Ops | Sana K.",
    team: "Operations",
    packet_status: "draft",
    merchant_response_draft:
      "We acknowledge the customer's claim of non-receipt. Our records show the order was shipped on 11 Aug; however, delivery proof is currently unavailable. We are escalating internally to obtain POD from the courier before contesting.",
    audit_log: [
      { timestamp: "2026-08-20T11:50:00Z", actor: "AI Classifier", action: "classified", detail: "Dispute classified as goods_not_received" },
      { timestamp: "2026-08-20T11:51:00Z", actor: "Rule Engine", action: "recommended", detail: "Recommend escalate (delivery proof missing)" },
      { timestamp: "2026-08-20T11:52:00Z", actor: "Evidence Radar", action: "missing", detail: "Missing: delivery proof, tracking snapshot" },
      { timestamp: "2026-08-20T11:53:00Z", actor: "System", action: "human_approval_required", detail: "Packet held for human approval" }
    ]
  },
  {
    case_id: "PP-2026-0002",
    payment_id: "pay_Qz3W8mNoPqRsT",
    order_id: "ord_8802GoodsRecvProof",
    dispute_id: "disp_5502",
    refund_id: "",
    arn: "",
    rrn: "",
    utr: "",
    customer_name: "Priya Nair",
    customer_email: "priya.nair@example.in",
    amount: 1299,
    currency: "INR",
    payment_status: "captured",
    refund_status: "none",
    delivery_status: "delivered",
    dispute_type: "goods_not_received",
    dispute_reason: "Customer claims goods not received",
    risk_score: 58,
    readiness_score: 100,
    confidence_score: 88,
    customer_message: "I didn't get my package, please refund.",
    case_summary: "Customer claims non-receipt, however signed delivery proof (POD) and tracking confirm delivery on 14 Aug. Strong evidence to contest.",
    available_evidence: ["invoice", "delivery proof", "tracking snapshot", "customer communication", "policy snapshot"],
    missing_evidence: [],
    timeline_events: [
      { event: "payment.captured", timestamp: "2026-08-09T06:10:00Z", status: "ok", detail: "INR 1,299 captured" },
      { event: "order shipped", timestamp: "2026-08-09T18:00:00Z", status: "ok", detail: "Courier dispatch" },
      { event: "delivered", timestamp: "2026-08-14T10:22:00Z", status: "ok", detail: "POD signed | tracking confirmed" },
      { event: "customer complained", timestamp: "2026-08-19T07:30:00Z", status: "warn", detail: "Non-receipt claim" },
      { event: "payment.dispute.created", timestamp: "2026-08-21T09:00:00Z", status: "alert", detail: "disp_5502 | goods not received" }
    ],
    recommended_action: "contest",
    action_reason: "Goods not received claim but delivery proof exists - contest.",
    deadline: "2026-09-04",
    owner: "Support | Rahul V.",
    team: "Support",
    packet_status: "draft",
    merchant_response_draft:
      "We respectfully contest this dispute. Delivery was completed on 14 Aug with signed proof of delivery and tracking confirmation attached. The order was fulfilled as agreed.",
    audit_log: [
      { timestamp: "2026-08-21T09:05:00Z", actor: "AI Classifier", action: "classified", detail: "Dispute classified as goods_not_received" },
      { timestamp: "2026-08-21T09:06:00Z", actor: "Rule Engine", action: "recommended", detail: "Recommend contest (delivery proof available)" },
      { timestamp: "2026-08-21T09:07:00Z", actor: "Evidence Radar", action: "complete", detail: "All required evidence present" }
    ]
  },
  {
    case_id: "PP-2026-0003",
    payment_id: "pay_Ry4L9pQrStUvW",
    order_id: "ord_8803RefundArn",
    dispute_id: "disp_5503",
    refund_id: "rfd_3301",
    arn: "100200300405503",
    rrn: "RRN5503",
    utr: "UTR5503",
    customer_name: "Imran Khan",
    customer_email: "imran.khan@example.in",
    amount: 2360,
    currency: "INR",
    payment_status: "captured",
    refund_status: "processed",
    delivery_status: "delivered",
    dispute_type: "refund_not_processed",
    dispute_reason: "Customer claims refund not received",
    risk_score: 65,
    readiness_score: 100,
    confidence_score: 85,
    customer_message: "You promised a refund 10 days ago but I never got the money.",
    case_summary: "Refund was processed with ARN 100200300405503 and UTR on record. Customer likely has not located the credit. Contest/explain with ARN.",
    available_evidence: ["payment receipt", "refund id", "arn", "refund policy", "customer communication"],
    missing_evidence: [],
    timeline_events: [
      { event: "payment.captured", timestamp: "2026-07-25T10:00:00Z", status: "ok", detail: "INR 2,360 captured" },
      { event: "refund initiated", timestamp: "2026-08-01T14:00:00Z", status: "ok", detail: "rfd_3301 initiated" },
      { event: "refund.processed", timestamp: "2026-08-03T09:15:00Z", status: "ok", detail: "ARN 100200300405503 | UTR issued" },
      { event: "customer complained", timestamp: "2026-08-13T11:00:00Z", status: "warn", detail: "Refund not received claim" },
      { event: "payment.dispute.created", timestamp: "2026-08-22T08:20:00Z", status: "alert", detail: "disp_5503 | refund not processed" }
    ],
    recommended_action: "contest",
    action_reason: "Refund processed with ARN + refund ID on record - contest/explain.",
    deadline: "2026-09-05",
    owner: "Finance | Neha S.",
    team: "Finance",
    packet_status: "draft",
    merchant_response_draft:
      "We contest this dispute. The refund of INR 2,360 was processed on 03 Aug with ARN 100200300405503 and UTR. The customer may locate the credit using the ARN at their bank.",
    audit_log: [
      { timestamp: "2026-08-22T08:25:00Z", actor: "AI Classifier", action: "classified", detail: "Dispute classified as refund_not_processed" },
      { timestamp: "2026-08-22T08:26:00Z", actor: "Rule Engine", action: "recommended", detail: "Recommend contest (ARN + refund ID present)" },
      { timestamp: "2026-08-22T08:27:00Z", actor: "Evidence Radar", action: "complete", detail: "All required evidence present" }
    ]
  },
  {
    case_id: "PP-2026-0004",
    payment_id: "pay_Sz5M2qRsTuVwX",
    order_id: "ord_8804RefundNoProof",
    dispute_id: "disp_5504",
    refund_id: "",
    arn: "",
    rrn: "",
    utr: "",
    customer_name: "Deepa Rao",
    customer_email: "deepa.rao@example.in",
    amount: 1899,
    currency: "INR",
    payment_status: "captured",
    refund_status: "promised",
    delivery_status: "delivered",
    dispute_type: "refund_not_processed",
    dispute_reason: "Customer claims refund not received",
    risk_score: 71,
    readiness_score: 60,
    confidence_score: 78,
    customer_message: "You said you'd refund me for the damaged item but I haven't received anything.",
    case_summary: "Merchant promised a refund but no refund was actually processed; no refund ID or ARN exists. Recommend accept and process refund.",
    available_evidence: ["payment receipt", "customer communication", "refund policy"],
    missing_evidence: ["refund id", "arn"],
    timeline_events: [
      { event: "payment.captured", timestamp: "2026-08-02T11:30:00Z", status: "ok", detail: "INR 1,899 captured" },
      { event: "delivered", timestamp: "2026-08-05T16:00:00Z", status: "ok", detail: "Order delivered" },
      { event: "customer complained", timestamp: "2026-08-08T09:00:00Z", status: "warn", detail: "Damaged item, refund requested" },
      { event: "refund promised", timestamp: "2026-08-09T13:00:00Z", status: "warn", detail: "Agent promised refund, not processed" },
      { event: "payment.dispute.created", timestamp: "2026-08-23T10:10:00Z", status: "alert", detail: "disp_5504 | refund not processed" }
    ],
    recommended_action: "accept",
    action_reason: "No refund proof / ARN but merchant promised refund - accept/refund.",
    deadline: "2026-09-06",
    owner: "Finance | Neha S.",
    team: "Finance",
    packet_status: "draft",
    merchant_response_draft:
      "We accept this dispute. A refund was promised but not processed in time. We will process the refund of INR 1,899 to the original payment method and close this case.",
    audit_log: [
      { timestamp: "2026-08-23T10:15:00Z", actor: "AI Classifier", action: "classified", detail: "Dispute classified as refund_not_processed" },
      { timestamp: "2026-08-23T10:16:00Z", actor: "Rule Engine", action: "recommended", detail: "Recommend accept/refund (no refund proof)" },
      { timestamp: "2026-08-23T10:17:00Z", actor: "Evidence Radar", action: "missing", detail: "Missing: refund id, arn" }
    ]
  },
  {
    case_id: "PP-2026-0005",
    payment_id: "pay_Ta6N3rStUvWxY",
    order_id: "ord_8805DupConfirmed",
    dispute_id: "disp_5505",
    refund_id: "",
    arn: "",
    rrn: "",
    utr: "",
    customer_name: "Karan Patel",
    customer_email: "karan.patel@example.in",
    amount: 3499,
    currency: "INR",
    payment_status: "captured",
    refund_status: "none",
    delivery_status: "n/a",
    dispute_type: "duplicate_payment",
    dispute_reason: "Customer claims duplicate payment",
    risk_score: 76,
    readiness_score: 100,
    confidence_score: 92,
    customer_message: "I was charged twice for the same order by mistake.",
    case_summary: "Confirmed duplicate: two captures for same customer, same amount (INR 3,499), same order within 2 minutes. Recommend accept/refund one charge.",
    available_evidence: ["both payment receipts", "order mapping", "timestamps", "refund status"],
    missing_evidence: [],
    timeline_events: [
      { event: "payment.captured", timestamp: "2026-08-15T17:01:00Z", status: "ok", detail: "INR 3,499 captured (1st)" },
      { event: "payment.captured", timestamp: "2026-08-15T17:02:30Z", status: "alert", detail: "INR 3,499 captured (2nd, duplicate)" },
      { event: "customer complained", timestamp: "2026-08-16T08:00:00Z", status: "warn", detail: "Duplicate charge reported" },
      { event: "payment.dispute.created", timestamp: "2026-08-24T09:30:00Z", status: "alert", detail: "disp_5505 | duplicate payment" }
    ],
    recommended_action: "accept",
    action_reason: "Duplicate payment confirmed (same customer, amount, order) - accept/refund.",
    deadline: "2026-09-07",
    owner: "Ops | Sana K.",
    team: "Operations",
    packet_status: "draft",
    merchant_response_draft:
      "We accept this dispute. A duplicate capture of INR 3,499 occurred for the same order within 2 minutes. We will refund the duplicate charge to the customer's original payment method.",
    audit_log: [
      { timestamp: "2026-08-24T09:35:00Z", actor: "AI Classifier", action: "classified", detail: "Dispute classified as duplicate_payment" },
      { timestamp: "2026-08-24T09:36:00Z", actor: "Rule Engine", action: "recommended", detail: "Recommend accept/refund (confirmed duplicate)" },
      { timestamp: "2026-08-24T09:37:00Z", actor: "Evidence Radar", action: "complete", detail: "All required evidence present" }
    ]
  },
  {
    case_id: "PP-2026-0006",
    payment_id: "pay_Ub7O4sTuVwXyZ",
    order_id: "ord_8806DupSeparate",
    dispute_id: "disp_5506",
    refund_id: "",
    arn: "",
    rrn: "",
    utr: "",
    customer_name: "Meera Iyer",
    customer_email: "meera.iyer@example.in",
    amount: 2999,
    currency: "INR",
    payment_status: "captured",
    refund_status: "none",
    delivery_status: "delivered",
    dispute_type: "duplicate_payment",
    dispute_reason: "Customer claims duplicate payment",
    risk_score: 60,
    readiness_score: 100,
    confidence_score: 86,
    customer_message: "I think I was charged twice, please refund one.",
    case_summary: "Customer claims duplicate, but records show two separate orders (different order IDs) for different items. Duplicate not confirmed - contest.",
    available_evidence: ["both payment receipts", "order mapping", "timestamps", "refund status"],
    missing_evidence: [],
    timeline_events: [
      { event: "payment.captured", timestamp: "2026-08-12T13:00:00Z", status: "ok", detail: "INR 2,999 | order A" },
      { event: "payment.captured", timestamp: "2026-08-13T10:15:00Z", status: "ok", detail: "INR 2,999 | order B (separate)" },
      { event: "delivered", timestamp: "2026-08-16T09:00:00Z", status: "ok", detail: "Both orders delivered" },
      { event: "customer complained", timestamp: "2026-08-20T12:00:00Z", status: "warn", detail: "Duplicate claim" },
      { event: "payment.dispute.created", timestamp: "2026-08-25T08:00:00Z", status: "alert", detail: "disp_5506 | duplicate payment" }
    ],
    recommended_action: "contest",
    action_reason: "Two separate orders - duplicate claim not confirmed - contest.",
    deadline: "2026-09-08",
    owner: "Support | Rahul V.",
    team: "Support",
    packet_status: "draft",
    merchant_response_draft:
      "We contest this dispute. The two charges correspond to two separate orders with distinct order IDs and different items, both delivered. This is not a duplicate payment.",
    audit_log: [
      { timestamp: "2026-08-25T08:05:00Z", actor: "AI Classifier", action: "classified", detail: "Dispute classified as duplicate_payment" },
      { timestamp: "2026-08-25T08:06:00Z", actor: "Rule Engine", action: "recommended", detail: "Recommend contest (two separate orders)" },
      { timestamp: "2026-08-25T08:07:00Z", actor: "Evidence Radar", action: "complete", detail: "All required evidence present" }
    ]
  }
].map(withRazorpayFields);
