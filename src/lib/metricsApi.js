import { calculateProofPilotMetrics } from "./metrics";
import { apiFetch } from "./apiClient";

export async function fetchBackendMetrics(fallbackCases = []) {
  const response = await apiFetch("/api/metrics");
  if (!response.ok) {
    throw new Error("Metrics service unavailable");
  }
  const payload = await response.json();
  return payload?.metrics || calculateProofPilotMetrics(fallbackCases);
}

