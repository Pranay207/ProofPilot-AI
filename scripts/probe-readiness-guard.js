import path from "node:path";

process.env.DOTENV_CONFIG_PATH = path.resolve(process.cwd(), ".env.test-missing");
process.env.NODE_ENV = "test";
process.env.USE_DATABASE = "false";
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";
delete process.env.AUTH_JWKS_URL;
delete process.env.AUTH_ISSUER;
delete process.env.AUTH_AUDIENCE;

const { app } = await import("../server/index.js");

const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function hit(method, pathName, body) {
  const response = await fetch(`${base}${pathName}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

const cases = await hit("GET", "/api/cases");
const list = Array.isArray(cases.body) ? cases.body : [];
const target = list.find((item) => item.case_id === "PP-2026-0001");

console.log("CASE", JSON.stringify({
  get_status: cases.status,
  case_id: target?.case_id,
  readiness_score: target?.readiness_score,
  packet_status: target?.packet_status,
}, null, 2));

const submit = await hit("POST", "/api/cases/PP-2026-0001/submit", { action: "contest" });
console.log("SUBMIT", JSON.stringify(submit, null, 2));

const decision = await hit("PATCH", "/api/cases/PP-2026-0001/decision", {
  status: "approved",
  reason: "Bypass UI contest attempt",
});
console.log("DECISION_APPROVE", JSON.stringify(decision, null, 2));

const bulk = await hit("POST", "/api/cases/bulk-action", {
  caseIds: ["PP-2026-0001"],
  action: "approve",
});
console.log("BULK_APPROVE", JSON.stringify(bulk, null, 2));

server.close();
