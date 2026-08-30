function getAccessToken() {
  if (typeof window === "undefined") return "";
  return window.__PROOFPILOT_AUTH_TOKEN__ || window.localStorage.getItem("proofpilot_access_token") || "";
}

export function apiFetch(input, init = {}) {
  const token = getAccessToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}