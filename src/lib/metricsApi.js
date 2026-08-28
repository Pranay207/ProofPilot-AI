import { calculateProofPilotMetrics } from "./metrics";

export async function fetchBackendMetrics(fallbackCases = []) {
  const response = await fetch("/api/metrics");
  if (!response.ok) {
    throw new Error("Metrics service unavailable");
  }
  const payload = await response.json();
  return payload?.metrics || calculateProofPilotMetrics(fallbackCases);
}

