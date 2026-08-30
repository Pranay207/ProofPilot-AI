import crypto from "node:crypto";

export const RAZORPAY_ALLOWED_WEBHOOK_EVENTS = new Set([
  "payment.captured",
  "payment.failed",
  "refund.processed",
  "refund.failed",
  "payment.dispute.created",
  "payment.dispute.won",
  "payment.dispute.lost",
  "payment.dispute.closed",
]);

export function getPayloadHash(rawBody) {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

export function getWebhookEntity(payload, key) {
  return payload?.payload?.[key]?.entity || null;
}

export function extractWebhookIds(payload) {
  const payment = getWebhookEntity(payload, "payment") || {};
  const dispute = getWebhookEntity(payload, "dispute") || {};
  const refund = getWebhookEntity(payload, "refund") || {};
  return {
    paymentId: payment.id || dispute.payment_id || refund.payment_id || null,
    disputeId: dispute.id || null,
    refundId: refund.id || null,
  };
}

export function toWebhookAuditShape(row) {
  if (!row) return null;
  return {
    event_id: row.id,
    payment_id: row.paymentId,
    event_type: row.event,
    processed_at: row.receivedAt?.toISOString?.() || row.receivedAt,
    payload_hash: row.eventFingerprint,
    status: row.status,
    created_case_id: row.createdCaseId,
  };
}

export async function recordWebhookEvent({ db, payload, rawBody, merchantId }) {
  const ids = extractWebhookIds(payload);
  const payloadHash = getPayloadHash(rawBody);

  if (!db) {
    return {
      stored: false,
      mode: "memory",
      payment_id: ids.paymentId,
      dispute_id: ids.disputeId,
      payload_hash: payloadHash,
    };
  }

  const existing = await db.webhookEvent.findUnique({ where: { eventFingerprint: payloadHash } });
  if (existing) {
    return {
      stored: false,
      duplicate: true,
      payment_id: existing.paymentId,
      dispute_id: existing.disputeId,
      case_id: existing.createdCaseId,
      payload_hash: existing.eventFingerprint,
      audit: toWebhookAuditShape(existing),
    };
  }

  const saved = await db.webhookEvent.create({
    data: {
      event: payload.event || "unknown",
      merchantId,
      eventFingerprint: payloadHash,
      paymentId: ids.paymentId,
      disputeId: ids.disputeId,
      refundId: ids.refundId,
      payload,
    },
  });

  return {
    stored: true,
    payment_id: saved.paymentId,
    dispute_id: saved.disputeId,
    payload_hash: saved.eventFingerprint,
    audit: toWebhookAuditShape(saved),
  };
}
