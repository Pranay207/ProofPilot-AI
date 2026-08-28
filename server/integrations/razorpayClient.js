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

export async function callRazorpay(path) {
  const config = getRazorpayConfig();
  if (!config.configured) {
    const error = new Error("Razorpay keys are not configured");
    error.status = 503;
    throw error;
  }

  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");
  const response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(body.error?.description || body.error?.reason || "Razorpay API request failed");
    error.status = response.status;
    error.payload = body;
    throw error;
  }
  return body;
}
