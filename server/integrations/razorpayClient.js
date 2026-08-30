const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

export function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return {
    configured: Boolean(keyId && keySecret),
    keyId,
    keySecret,
    mode: keyId?.startsWith("rzp_live_") ? "live" : keyId?.startsWith("rzp_test_") ? "test" : "unknown",
    maskedKeyId: keyId ? `${keyId.slice(0, 8)}...${keyId.slice(-4)}` : "",
  };
}

async function requestRazorpay(path, { method = "GET", body, headers = {} } = {}) {
  const config = getRazorpayConfig();
  if (!config.configured) {
    const error = new Error("Razorpay keys are not configured");
    error.status = 503;
    throw error;
  }

  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");
  const response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const responseBody = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(responseBody.error?.description || responseBody.error?.reason || "Razorpay API request failed");
    error.status = response.status;
    error.payload = responseBody;
    throw error;
  }
  return responseBody;
}

export async function callRazorpay(path) {
  return requestRazorpay(path);
}

export async function contestRazorpayDispute(disputeId, evidence) {
  return requestRazorpay(`/disputes/${encodeURIComponent(disputeId)}/contest`, {
    method: "PATCH",
    body: { ...evidence, action: "submit" },
  });
}

export async function acceptRazorpayDispute(disputeId) {
  return requestRazorpay(`/disputes/${encodeURIComponent(disputeId)}/accept`, { method: "POST" });
}

export async function uploadRazorpayDocument({ fileName, mimeType, buffer }) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), fileName);
  form.append("purpose", "dispute_evidence");
  return requestRazorpay("/documents", { method: "POST", body: form });
}
