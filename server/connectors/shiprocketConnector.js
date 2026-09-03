// ProofPilot Shiprocket Courier Connector
// Production-grade integration with Shiprocket API for automated delivery tracking & POD retrieval.

export const CONNECTOR_ID = "shiprocket";
export const CONNECTOR_NAME = "Shiprocket Delivery Tracking";

const SHIPROCKET_BASE_URL = process.env.SHIPROCKET_API_BASE_URL || "https://apiv2.shiprocket.in/v1/external";

let cachedToken = null;
let tokenExpiresAt = 0;
let tokenPromise = null;

/**
 * Validates whether required credentials exist in the environment.
 */
export function isConfigured() {
  return Boolean(
    process.env.SHIPROCKET_TOKEN ||
    (process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD)
  );
}

/**
 * Resets token cache on 401 Unauthorized to trigger a fresh login on subsequent retries.
 */
export function invalidateToken() {
  cachedToken = null;
  tokenExpiresAt = 0;
  tokenPromise = null;
}

/**
 * Execute HTTP requests with configurable retries and exponential backoff.
 */
async function fetchWithRetry(url, options = {}, retries = 2, backoffMs = 500) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 401 && attempt < retries) {
        invalidateToken();
        const newToken = await getAuthToken();
        if (options.headers) {
          options.headers.Authorization = `Bearer ${newToken}`;
        }
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Authenticates against /v1/external/auth/login and securely caches JWT token.
 * Uses mutex promise to prevent race conditions from concurrent calls.
 */
export async function getAuthToken() {
  if (process.env.SHIPROCKET_TOKEN) {
    return process.env.SHIPROCKET_TOKEN;
  }

  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 15 * 60 * 1000) {
    return cachedToken;
  }

  if (tokenPromise) {
    return tokenPromise;
  }

  tokenPromise = (async () => {
    const email = process.env.SHIPROCKET_EMAIL;
    const password = process.env.SHIPROCKET_PASSWORD;

    if (!email || !password) {
      throw new Error("Missing SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD credentials in environment.");
    }

    try {
      const response = await fetchWithRetry(`${SHIPROCKET_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }, 2, 400);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown authentication error");
        throw new Error(`Shiprocket authentication failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      if (!data?.token) {
        throw new Error("Shiprocket authentication response did not return a valid JWT token.");
      }

      cachedToken = data.token;
      // Default to 10 days if expires_in is omitted
      const ttlSeconds = typeof data.expires_in === "number" ? data.expires_in : 10 * 86400;
      tokenExpiresAt = Date.now() + ttlSeconds * 1000;
      return cachedToken;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

/**
 * Authenticated API caller with Bearer token injection.
 */
async function callShiprocket(endpointPath, options = {}) {
  const token = await getAuthToken();
  const cleanPath = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  const url = `${SHIPROCKET_BASE_URL}${cleanPath}`;

  const response = await fetchWithRetry(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Shiprocket API error [${response.status}] on ${endpointPath}: ${errText}`);
  }

  return response.json();
}

/**
 * Calls /v1/external/courier/track/awb/:awb_code
 */
export async function fetchTrackingByAwb(awbCode) {
  if (!awbCode) throw new Error("AWB code is required for AWB tracking");
  return callShiprocket(`/courier/track/awb/${encodeURIComponent(awbCode)}`);
}

/**
 * Calls /v1/external/courier/track?order_id=:order_id
 */
export async function fetchTrackingByOrderId(orderId) {
  if (!orderId) throw new Error("Order ID is required for order tracking");
  return callShiprocket(`/courier/track?order_id=${encodeURIComponent(orderId)}`);
}

/**
 * Normalizes Shiprocket tracking response into standardized delivery proof data.
 */
export function normalizeTrackingResponse(payload, fallbackAwb = "", fallbackOrderId = "") {
  const trackingData = payload?.tracking_data || payload?.[0]?.tracking_data || payload || {};
  const shipmentTrack = Array.isArray(trackingData?.shipment_track)
    ? trackingData.shipment_track[0]
    : trackingData?.shipment_track || {};

  const currentStatus = String(shipmentTrack.current_status || trackingData?.current_status || trackingData?.shipment_status || trackingData?.track_status || "").toUpperCase();
  const courierName = shipmentTrack.courier_name || trackingData?.courier_name || "Shiprocket Courier Partner";
  const awbCode = shipmentTrack.awb_code || trackingData?.awb_code || trackingData?.awb || fallbackAwb || "";
  const orderId = shipmentTrack.order_id || trackingData?.order_id || fallbackOrderId || "";
  const deliveredDate = shipmentTrack.delivered_date || shipmentTrack.delivered_to_date || shipmentTrack.delivery_date || null;
  const podUrl = shipmentTrack.pod || shipmentTrack.pod_url || trackingData?.pod || null;
  const recipientName = shipmentTrack.delivered_to || shipmentTrack.consignee_name || "Verified Customer";
  const destination = shipmentTrack.destination || shipmentTrack.city || "";
  const scans = Array.isArray(trackingData?.scans) ? trackingData.scans : [];

  const isDelivered = currentStatus === "DELIVERED" || String(trackingData?.track_status) === "1";

  return {
    isDelivered,
    currentStatus: currentStatus || "IN_TRANSIT",
    courierName,
    awbCode,
    orderId,
    deliveredDate,
    podUrl,
    recipientName,
    destination,
    scans,
    latestScan: scans.length > 0 ? scans[scans.length - 1] : null,
    raw: trackingData,
  };
}

/**
 * Core synchronization service for Shiprocket delivery proof & AWB tracking.
 *
 * @param {object} params
 * @param {object} params.caseItem - The dispute Case object
 * @param {string} [params.awbCode] - Optional explicit AWB override
 * @param {string} [params.orderId] - Optional explicit Order ID override
 * @returns {Promise<object>} SyncResult
 */
export async function syncShiprocketTracking({ caseItem = {}, awbCode = "", orderId = "" }) {
  if (!isConfigured()) {
    return {
      ok: false,
      connector: CONNECTOR_ID,
      connector_status: "not_configured",
      error: "Shiprocket credentials missing. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in environment.",
      evidence: [],
    };
  }

  const effectiveAwb = String(awbCode || caseItem.arn || caseItem.evidence_files?.["delivery proof"]?.awb || "").trim();
  const effectiveOrderId = String(orderId || caseItem.order_id || "").trim();

  if (!effectiveAwb && !effectiveOrderId) {
    return {
      ok: false,
      connector: CONNECTOR_ID,
      connector_status: "missing_identifiers",
      error: "Neither AWB code nor Order ID was found on this case to track via Shiprocket.",
      evidence: [],
    };
  }

  let trackingResponse = null;
  let lookupMethod = "awb";

  // 1. Try AWB lookup first if available
  if (effectiveAwb) {
    try {
      trackingResponse = await fetchTrackingByAwb(effectiveAwb);
    } catch (awbErr) {
      // Fallback to order ID if AWB lookup fails
      if (effectiveOrderId) {
        lookupMethod = "order_id";
        trackingResponse = await fetchTrackingByOrderId(effectiveOrderId);
      } else {
        throw awbErr;
      }
    }
  } else if (effectiveOrderId) {
    lookupMethod = "order_id";
    trackingResponse = await fetchTrackingByOrderId(effectiveOrderId);
  }

  const normalized = normalizeTrackingResponse(trackingResponse, effectiveAwb, effectiveOrderId);

  // 2. Prepare structured Evidence Items for ProofPilot
  const evidenceItems = [];

  // A. Tracking Snapshot
  evidenceItems.push({
    evidence_key: "tracking snapshot",
    label: "Shiprocket Tracking Snapshot",
    source: "shiprocket_api",
    connector_status: "synced",
    data: {
      awb_code: normalized.awbCode,
      order_id: normalized.orderId,
      courier_name: normalized.courierName,
      status: normalized.currentStatus,
      lookup_method: lookupMethod,
      checkpoint_count: normalized.scans.length,
      latest_scan: normalized.latestScan,
      destination: normalized.destination,
      synced_at: new Date().toISOString(),
    },
    auto_available: Boolean(normalized.awbCode || normalized.scans.length > 0),
    summary: `Courier: ${normalized.courierName} | AWB: ${normalized.awbCode || "N/A"} | Status: ${normalized.currentStatus} (${normalized.scans.length} scans)`,
  });

  // B. Delivery Proof / POD
  evidenceItems.push({
    evidence_key: "delivery proof",
    label: "Delivery Proof (POD)",
    source: "shiprocket_api",
    connector_status: "synced",
    data: {
      delivered: normalized.isDelivered,
      delivered_date: normalized.deliveredDate,
      delivered_to: normalized.recipientName,
      pod_url: normalized.podUrl,
      courier_name: normalized.courierName,
      awb_code: normalized.awbCode,
      current_status: normalized.currentStatus,
      synced_at: new Date().toISOString(),
    },
    auto_available: normalized.isDelivered || Boolean(normalized.podUrl),
    summary: normalized.isDelivered
      ? `Delivered to ${normalized.recipientName} on ${normalized.deliveredDate || "Recorded Delivery Date"} via ${normalized.courierName}${normalized.podUrl ? ` [POD: ${normalized.podUrl}]` : ""}`
      : `Shipment status: ${normalized.currentStatus} with ${normalized.courierName}. Proof of delivery pending final courier scan.`,
  });

  return {
    ok: true,
    connector: CONNECTOR_ID,
    connector_name: CONNECTOR_NAME,
    connector_status: "synced",
    lookup_method: lookupMethod,
    tracking_summary: {
      awb_code: normalized.awbCode,
      courier_name: normalized.courierName,
      status: normalized.currentStatus,
      is_delivered: normalized.isDelivered,
      delivered_date: normalized.deliveredDate,
      pod_url: normalized.podUrl,
      scan_count: normalized.scans.length,
    },
    evidence: evidenceItems,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Standard connector registry interface.
 */
export async function collectEvidence(caseItem) {
  try {
    return await syncShiprocketTracking({ caseItem });
  } catch (error) {
    return {
      connector: CONNECTOR_ID,
      status: "error",
      error: error.message,
      message: `Shiprocket auto-collection error: ${error.message}`,
      evidence: [],
    };
  }
}
