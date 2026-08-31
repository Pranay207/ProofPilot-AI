// ProofPilot Razorpay Refund Evidence Connector
// REAL connector — pulls live refund data from Razorpay API.
// Uses the existing razorpayClient.js credentials.

import { callRazorpay as requestRazorpay } from "../integrations/razorpayClient.js";

export const CONNECTOR_ID = "razorpay_refund";
export const CONNECTOR_NAME = "Razorpay Refund Status";

/**
 * Check if this connector is configured and usable.
 */
export function isConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/**
 * Pull refund evidence for a case.
 * Returns evidence items that can be attached to the case.
 *
 * @param {object} caseItem - The ProofPilot case object
 * @returns {object} ConnectorResult
 */
export async function collectEvidence(caseItem) {
  if (!isConfigured()) {
    return {
      connector: CONNECTOR_ID,
      status: "not_configured",
      message: "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set to use this connector.",
      evidence: [],
    };
  }

  const results = [];

  // 1. Try to fetch refund by refund_id
  if (caseItem.refund_id) {
    try {
      const refund = await requestRazorpay(`/refunds/${encodeURIComponent(caseItem.refund_id)}`);
      if (refund?.id) {
        results.push({
          evidence_key: "refund id",
          label: "Razorpay Refund Record",
          source: "razorpay_api",
          data: {
            refund_id: refund.id,
            payment_id: refund.payment_id,
            amount_inr: Math.round((refund.amount || 0) / 100),
            status: refund.status,
            created_at: refund.created_at,
            speed_processed: refund.speed_processed,
          },
          auto_available: refund.status === "processed",
          summary: `Refund ${refund.id} is ${refund.status} for INR ${Math.round((refund.amount || 0) / 100)}`,
        });

        // If refund is processed and has an ARN-like reference, extract it
        if (refund.acquirer_data?.arn) {
          results.push({
            evidence_key: "arn",
            label: "ARN / Bank Reference",
            source: "razorpay_api",
            data: { arn: refund.acquirer_data.arn, refund_id: refund.id },
            auto_available: true,
            summary: `ARN ${refund.acquirer_data.arn} from Razorpay refund data`,
          });
        }
      }
    } catch (error) {
      results.push({
        evidence_key: "refund id",
        label: "Razorpay Refund Record",
        source: "razorpay_api",
        error: error.message,
        auto_available: false,
        summary: `Could not fetch refund ${caseItem.refund_id}: ${error.message}`,
      });
    }
  }

  // 2. Try to fetch payment details for additional signals
  if (caseItem.payment_id) {
    try {
      const payment = await requestRazorpay(`/payments/${encodeURIComponent(caseItem.payment_id)}`);
      if (payment?.id) {
        results.push({
          evidence_key: "payment receipt",
          label: "Razorpay Payment Record",
          source: "razorpay_api",
          data: {
            payment_id: payment.id,
            order_id: payment.order_id,
            amount_inr: Math.round((payment.amount || 0) / 100),
            status: payment.status,
            method: payment.method,
            captured: payment.captured,
            email: payment.email,
            created_at: payment.created_at,
          },
          auto_available: Boolean(payment.id),
          summary: `Payment ${payment.id} (${payment.status}, INR ${Math.round((payment.amount || 0) / 100)}) via ${payment.method}`,
        });
      }
    } catch (error) {
      results.push({
        evidence_key: "payment receipt",
        label: "Razorpay Payment Record",
        source: "razorpay_api",
        error: error.message,
        auto_available: false,
        summary: `Could not fetch payment ${caseItem.payment_id}: ${error.message}`,
      });
    }
  }

  return {
    connector: CONNECTOR_ID,
    status: results.length > 0 ? "success" : "no_data",
    evidence: results,
    fetched_at: new Date().toISOString(),
  };
}
