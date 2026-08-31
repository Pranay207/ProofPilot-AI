// ProofPilot Evidence Connector Registry
// Orchestrates all evidence connectors and runs auto-collection for a case.
// Connectors are run in parallel; failures are isolated (one bad connector won't block others).

import * as razorpayRefund from "./razorpayRefundConnector.js";
import * as shiprocket from "./shiprocketConnector.js";
import * as emailSummary from "./emailSummaryConnector.js";

// Registered connectors — add new connectors here
const CONNECTORS = [razorpayRefund, shiprocket, emailSummary];

/**
 * Get status summary of all configured connectors.
 */
export function getConnectorStatus() {
  return CONNECTORS.map((connector) => ({
    id: connector.CONNECTOR_ID,
    name: connector.CONNECTOR_NAME,
    configured: connector.isConfigured(),
    status: connector.isConfigured() ? "active" : "not_configured",
  }));
}

/**
 * Run all configured evidence connectors for a case in parallel.
 * Returns aggregated evidence items and a per-connector result map.
 *
 * @param {object} caseItem - ProofPilot case object
 * @returns {object} CollectionResult
 */
export async function autoCollectEvidence(caseItem) {
  const startedAt = new Date().toISOString();

  // Run all connectors in parallel, isolating failures
  const results = await Promise.allSettled(
    CONNECTORS.map(async (connector) => {
      try {
        const result = await connector.collectEvidence(caseItem);
        return { ...result, connector_name: connector.CONNECTOR_NAME };
      } catch (error) {
        return {
          connector: connector.CONNECTOR_ID,
          connector_name: connector.CONNECTOR_NAME,
          status: "error",
          error: error.message,
          evidence: [],
        };
      }
    })
  );

  const connectorResults = results.map((result) =>
    result.status === "fulfilled" ? result.value : { status: "error", error: result.reason?.message, evidence: [] }
  );

  // Aggregate all evidence items across connectors
  const allEvidence = connectorResults.flatMap((result) => result.evidence || []);

  // Evidence items that can be auto-marked as available
  const autoAvailable = allEvidence.filter((item) => item.auto_available === true);

  return {
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    connectors_run: CONNECTORS.length,
    connectors_configured: CONNECTORS.filter((c) => c.isConfigured()).length,
    total_evidence_found: allEvidence.length,
    auto_available_count: autoAvailable.length,
    auto_available_evidence: autoAvailable.map((item) => item.evidence_key),
    connector_results: connectorResults,
    all_evidence: allEvidence,
  };
}
