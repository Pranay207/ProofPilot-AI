/**
 * ProofPilot-AI — Production-Grade Shiprocket Courier Tracking Service
 *
 * Official Shiprocket API integration:
 * - Base URL: https://apiv2.shiprocket.in/v1/external
 * - Reference: https://apidocs.shiprocket.in/
 */

export interface ShiprocketAuthResponse {
  id?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  company_id?: number;
  token: string;
  expires_in?: number;
}

export interface ShiprocketTrackingScan {
  date: string;
  status: string;
  activity: string;
  location: string;
  "sr-status"?: string;
  "sr-status-label"?: string;
}

export interface ShiprocketShipmentTrack {
  id?: number;
  awb_code: string;
  courier_name?: string;
  current_status?: string;
  delivered_date?: string;
  delivered_to?: string;
  destination?: string;
  origin?: string;
  pod?: string;
  pod_status?: string;
  tracking_url?: string;
  edd?: string;
}

export interface ShiprocketTrackingResponse {
  tracking_data?: {
    track_status?: number | string;
    shipment_status?: number | string;
    shipment_track?: ShiprocketShipmentTrack[];
    shipment_track_activities?: ShiprocketTrackingScan[];
    track_url?: string;
    pod?: string;
    pod_url?: string;
    courier_name?: string;
    awb_code?: string;
    scans?: ShiprocketTrackingScan[];
  };
  [key: string]: unknown;
}

export interface NormalizedShiprocketTracking {
  courierName: string;
  currentStatus: "DELIVERED" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "RTO" | "CANCELLED" | "PENDING" | string;
  isDelivered: boolean;
  awbCode: string;
  orderId?: string;
  deliveredDate: string | null;
  deliveredTo: string | null;
  podUrl: string | null;
  lastActivity: {
    activity: string;
    location: string;
    timestamp: string;
    status: string;
  } | null;
  activityHistory: Array<{
    date: string;
    activity: string;
    location: string;
    status: string;
  }>;
  raw: unknown;
}

export interface ShiprocketSyncRequest {
  caseId: string;
  awbCode: string;
  orderId?: string;
}

export interface ShiprocketSyncResult {
  success: boolean;
  connector: "shiprocket";
  connector_status: "synced" | "failed" | "not_configured";
  caseId: string;
  syncedData?: NormalizedShiprocketTracking;
  error?: string;
  syncedAt: string;
}

const SHIPROCKET_BASE_URL = process.env.SHIPROCKET_API_BASE_URL || "https://apiv2.shiprocket.in/v1/external";
const TOKEN_EXPIRY_BUFFER_MS = 60 * 60 * 1000; // 1 hour buffer before expiration

class ShiprocketTokenManager {
  private token: string | null = null;
  private expiresAt = 0;
  private activeAuthPromise: Promise<string> | null = null;

  public isConfigured(): boolean {
    return Boolean(
      process.env.SHIPROCKET_TOKEN ||
      (process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD)
    );
  }

  public invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
    this.activeAuthPromise = null;
  }

  public async getToken(): Promise<string> {
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

  private async fetchToken(): Promise<string> {
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

    const data: ShiprocketAuthResponse = await response.json();
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
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  initialBackoffMs = 500
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Handle 401 Unauthorized by clearing cached token on retry
      if (response.status === 401 && attempt < maxRetries) {
        tokenManager.invalidate();
        const freshToken = await tokenManager.getToken();
        if (options.headers) {
          (options.headers as Record<string, string>)["Authorization"] = `Bearer ${freshToken}`;
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
export async function fetchShiprocketTracking(awbCode: string): Promise<NormalizedShiprocketTracking> {
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

  const data: ShiprocketTrackingResponse = await response.json();
  return normalizeShiprocketData(data, cleanAwb);
}

/**
 * Normalizes raw Shiprocket API payload into structured ProofPilot delivery proof data.
 */
export function normalizeShiprocketData(
  payload: ShiprocketTrackingResponse,
  fallbackAwb = ""
): NormalizedShiprocketTracking {
  const trackingData = payload?.tracking_data || payload || {};
  const shipmentTrack = Array.isArray(trackingData?.shipment_track)
    ? trackingData.shipment_track[0]
    : (trackingData?.shipment_track as ShiprocketShipmentTrack) || {};

  const currentStatus = String(
    shipmentTrack.current_status ||
    trackingData?.shipment_status ||
    trackingData?.track_status ||
    "IN_TRANSIT"
  ).toUpperCase();

  const isDelivered = currentStatus === "DELIVERED" || String(trackingData?.track_status) === "1";
  const courierName = shipmentTrack.courier_name || trackingData?.courier_name || "Courier Partner";
  const awbCode = shipmentTrack.awb_code || trackingData?.awb_code || fallbackAwb;
  const deliveredDate = shipmentTrack.delivered_date || null;
  const deliveredTo = shipmentTrack.delivered_to || null;
  const podUrl = shipmentTrack.pod || trackingData?.pod || trackingData?.pod_url || null;

  const rawScans: ShiprocketTrackingScan[] = Array.isArray(trackingData?.scans)
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
