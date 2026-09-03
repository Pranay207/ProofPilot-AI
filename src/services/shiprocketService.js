/**
 * ProofPilot-AI — Production-Grade Shiprocket Courier Tracking Service (Node/ESM runtime)
 *
 * Official Shiprocket API integration:
 * - Base URL: https://apiv2.shiprocket.in/v1/external
 * - Reference: https://apidocs.shiprocket.in/
 */

const SHIPROCKET_BASE_URL = process.env.SHIPROCKET_API_BASE_URL || "https://apiv2.shiprocket.in/v1/external";
const TOKEN_EXPIRY_BUFFER_MS = 60 * 60 * 1000; // 1 hour buffer before expiration

class ShiprocketTokenManager {
  constructor() {
    this.token = null;
    this.expiresAt = 0;
    this.activeAuthPromise = null;
  }

  isConfigured() {
    return Boolean(
      process.env.SHIPROCKET_TOKEN ||
      (process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD)
    );
  }

  invalidate() {
    this.token = null;
    this.expiresAt = 0;
    this.activeAuthPromise = null;
  }

  async getToken() {
    if (process.env.SHIPROCKET_TOKEN) {
      return process.env.SHIPROCKET_TOKEN;
    }

    const now = Date.now();
    if (this.token && this.expiresAt > now + TOKEN_EXPIRY_BUFFER_MS) {
      return this.token;
    }

    if (this.activeAuthPromise) {
      return this.activeAuthPromise;
    }

    this.activeAuthPromise = this.fetchToken();
    try {
      return await this.activeAuthPromise;
    } finally {
      this.activeAuthPromise = null;
    }
  }

  async fetchToken() {
    const email = process.env.SHIPROCKET_EMAIL;
    const password = process.env.SHIPROCKET_PASSWORD;

    if (!email || !password) {
      throw new Error("Shiprocket credentials missing: SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD required");
    }

    const response = await fetchWithRetry(
      `${SHIPROCKET_BASE_URL}/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      },
      3,
      500
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Shiprocket auth failed (HTTP ${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (!data?.token) {
      throw new Error("Invalid Shiprocket authentication response: missing JWT token");
    }

    this.token = data.token;
    // Default Shiprocket token lifetime: 10 days
    const ttlSeconds = typeof data.expires_in === "number" ? data.expires_in : 10 * 86400;
    this.expiresAt = Date.now() + ttlSeconds * 1000;
    return this.token;
  }
}

export const tokenManager = new ShiprocketTokenManager();

/**
 * Executes fetch with exponential backoff for HTTP 429 (rate-limit) and HTTP 5xx (transient errors).
 */
export async function fetchWithRetry(
  url,
  options = {},
  maxRetries = 3,
  initialBackoffMs = 500
) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Handle 401 Unauthorized by clearing cached token on retry
      if (response.status === 401 && attempt < maxRetries) {
        tokenManager.invalidate();
        const freshToken = await tokenManager.getToken();
        if (options.headers) {
          options.headers["Authorization"] = `Bearer ${freshToken}`;
        }
        continue;
      }

      // Retry on 429 Rate Limit or 5xx Server Errors
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        const retryAfterHeader = response.headers.get("Retry-After");
        const delayMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : initialBackoffMs * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        const delayMs = initialBackoffMs * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error(`Network failure requesting ${url}`);
}

/**
 * Fetch live courier tracking by AWB code from Shiprocket.
 * GET /v1/external/courier/track/awb/:awb_code
 */
export async function fetchShiprocketTracking(awbCode) {
  const cleanAwb = String(awbCode || "").trim();
  if (!cleanAwb) {
    throw new Error("A valid AWB code is required for Shiprocket tracking lookup");
  }

  const token = await tokenManager.getToken();
  const url = `${SHIPROCKET_BASE_URL}/courier/track/awb/${encodeURIComponent(cleanAwb)}`;

  const response = await fetchWithRetry(
    url,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
    3,
    500
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Shiprocket API error [${response.status}] for AWB ${cleanAwb}: ${errorBody}`);
  }

  const data = await response.json();
  return normalizeShiprocketData(data, cleanAwb);
}

/**
 * Mock function to return dummy Shiprocket tracking data for testing.
 */
export async function fetchMockShiprocketTracking(awbCode) {
  const dummyPayload = { 
    "awb": awbCode || 59629792084, 
    "current_status": "Delivered", 
    "order_id": "13905312", 
    "current_timestamp": "2021-07-02 16:41:59", 
    "etd": "2021-07-02 16:41:59", 
    "current_status_id": 7, 
    "shipment_status": "Delivered", 
    "shipment_status_id": 7, 
    "channel_order_id": "enter your channel order id", 
    "channel": "enter your channel name", 
    "courier_name": "enter courier_name", 
    "scans": [ 
      { "date": "2019-06-25 12:08:00", "activity": "SHIPMENT DELIVERED", "location": "PATIALA" }, 
      { "date": "2019-06-25 12:06:00", "activity": "NECESSARY CHARGES PENDING FROM CONSIGNEE", "location": "PATIALA" }, 
      { "date": "2019-06-25 10:18:00", "activity": "SHIPMENT OUT FOR DELIVERY", "location": "PATIALA" }, 
      { "date": "2019-06-25 09:40:00", "activity": "SHIPMENT ARRIVED", "location": "PATIALA" }, 
      { "date": "2019-06-25 07:32:00", "activity": "SHIPMENT FURTHER CONNECTED", "location": "AMBALA AIR HUB" }, 
      { "date": "2019-06-25 07:03:00", "activity": "SHIPMENT ARRIVED AT HUB", "location": "AMBALA AIR HUB" }, 
      { "date": "2019-06-25 00:45:00", "activity": "SHIPMENT FURTHER CONNECTED", "location": "KAPASHERA HUB" }, 
      { "date": "2019-06-25 00:20:00", "activity": "SHIPMENT ARRIVED AT HUB", "location": "KAPASHERA HUB" }, 
      { "date": "2019-06-24 23:17:00", "activity": "SHIPMENT FURTHER CONNECTED", "location": "COD PROCESSING CENTRE I" }, 
      { "date": "2019-06-24 21:14:00", "activity": "SHIPMENT ARRIVED", "location": "COD PROCESSING CENTRE I" }, 
      { "date": "2019-06-24 18:56:00", "activity": "SHIPMENT PICKED UP", "location": "COD PROCESSING CENTRE I" } 
    ] 
  };
  return normalizeShiprocketData(dummyPayload, awbCode);
}

/**
 * Normalizes raw Shiprocket API payload into structured ProofPilot delivery proof data.
 */
export function normalizeShiprocketData(payload, fallbackAwb = "") {
  const trackingData = payload?.tracking_data || payload || {};
  const shipmentTrack = Array.isArray(trackingData?.shipment_track)
    ? trackingData.shipment_track[0]
    : trackingData?.shipment_track || {};

  const currentStatus = String(
    shipmentTrack.current_status ||
    trackingData?.shipment_status ||
    trackingData?.track_status ||
    "IN_TRANSIT"
  ).toUpperCase();

  const isDelivered = currentStatus === "DELIVERED" || String(trackingData?.track_status) === "1";
  const courierName = shipmentTrack.courier_name || trackingData?.courier_name || "Courier Partner";
  const awbCode = shipmentTrack.awb_code || trackingData?.awb_code || trackingData?.awb || fallbackAwb;
  const deliveredDate = shipmentTrack.delivered_date || null;
  const deliveredTo = shipmentTrack.delivered_to || null;
  const podUrl = shipmentTrack.pod || trackingData?.pod || trackingData?.pod_url || null;

  const rawScans = Array.isArray(trackingData?.scans)
    ? trackingData.scans
    : Array.isArray(trackingData?.shipment_track_activities)
    ? trackingData.shipment_track_activities
    : [];

  const activityHistory = rawScans.map((scan) => ({
    date: scan.date || "",
    activity: scan.activity || scan.status || "",
    location: scan.location || "",
    status: scan["sr-status-label"] || scan.status || "",
  }));

  const lastScan = activityHistory.length > 0 ? activityHistory[activityHistory.length - 1] : null;

  const lastActivity = lastScan
    ? {
        activity: lastScan.activity,
        location: lastScan.location,
        timestamp: lastScan.date,
        status: lastScan.status,
      }
    : null;

  return {
    courierName,
    currentStatus,
    isDelivered,
    awbCode,
    deliveredDate,
    deliveredTo,
    podUrl,
    lastActivity,
    activityHistory,
    raw: trackingData,
  };
}
