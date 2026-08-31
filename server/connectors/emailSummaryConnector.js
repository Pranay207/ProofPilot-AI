// ProofPilot Email/WhatsApp Evidence Connector (Stub)
// Pulls customer communication evidence from email/messaging systems.
// Supports Gmail API, SendGrid Inbound, and WhatsApp Business API stubs.

export const CONNECTOR_ID = "email_summary";
export const CONNECTOR_NAME = "Email / WhatsApp Communication Evidence";

export function isConfigured() {
  return Boolean(
    process.env.GMAIL_SERVICE_ACCOUNT_KEY ||
    process.env.SENDGRID_API_KEY ||
    process.env.WHATSAPP_BUSINESS_TOKEN
  );
}

/**
 * Collect customer communication evidence for a case.
 * Searches email/WhatsApp threads by payment_id, order_id, or customer_email.
 */
export async function collectEvidence(caseItem) {
  if (!isConfigured()) {
    return {
      connector: CONNECTOR_ID,
      status: "not_configured",
      message: "Set GMAIL_SERVICE_ACCOUNT_KEY, SENDGRID_API_KEY, or WHATSAPP_BUSINESS_TOKEN to enable communication evidence auto-collection.",
      evidence: [],
      production_steps: [
        "Gmail: Use Google Workspace Admin SDK to search threads by customer email",
        "SendGrid Inbound: Configure inbound parse webhook to store emails by order_id",
        "WhatsApp Business: Query conversation history via Meta Graph API by phone number",
        "Map found threads to ProofPilot 'customer communication' evidence key",
      ],
    };
  }

  // Production implementation placeholder
  return {
    connector: CONNECTOR_ID,
    status: "stub_configured",
    message: "Communication credentials detected but live API integration pending.",
    evidence: [],
  };
}
