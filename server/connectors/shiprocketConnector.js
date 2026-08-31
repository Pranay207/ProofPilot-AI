// ProofPilot Shiprocket Courier Connector (Stub)
// Pulls delivery tracking evidence from Shiprocket API.
// Activate by setting SHIPROCKET_EMAIL + SHIPROCKET_PASSWORD env vars.

export const CONNECTOR_ID = "shiprocket";
export const CONNECTOR_NAME = "Shiprocket Delivery Tracking";

export function isConfigured() {
  return Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);
}

/**
 * Collect delivery evidence for a case via Shiprocket API.
 * Production implementation: authenticate → search by order_id → fetch tracking.
 */
export async function collectEvidence(caseItem) {
  if (!isConfigured()) {
    return {
      connector: CONNECTOR_ID,
      status: "not_configured",
      message: "Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD to enable Shiprocket tracking auto-collection.",
      evidence: [],
      production_steps: [
        "POST https://apiv2.shiprocket.in/v1/external/auth/login to get token",
        "GET /v1/external/orders with filter on order_id",
        "GET /v1/external/courier/track with AWB code",
        "Map delivery status to ProofPilot 'delivery proof' and 'tracking snapshot' evidence keys",
      ],
    };
  }

  // Production implementation placeholder
  // In a real deployment:
  //   1. POST to Shiprocket /auth/login
  //   2. Search orders by caseItem.order_id
  //   3. Fetch tracking by AWB
  //   4. Return delivery proof + tracking snapshot
  return {
    connector: CONNECTOR_ID,
    status: "stub_configured",
    message: "Shiprocket credentials detected but live API integration pending. Implement collectEvidence() body.",
    evidence: [],
  };
}
