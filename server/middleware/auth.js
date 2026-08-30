import { createRemoteJWKSet, jwtVerify } from "jose";

const jwksUrl = process.env.AUTH_JWKS_URL;
const jwks = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null;

export async function authenticateRequest(req) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

  if (!token && process.env.NODE_ENV !== "production" && !jwks) {
    return { subject: process.env.DEV_AUTH_SUBJECT || "dev-merchant", email: "dev@example.invalid", name: "Development Merchant" };
  }
  if (!token || !jwks || !process.env.AUTH_ISSUER || !process.env.AUTH_AUDIENCE) {
    const error = new Error("Valid bearer authentication is required");
    error.status = 401;
    throw error;
  }

  const { payload } = await jwtVerify(token, jwks, {
    issuer: process.env.AUTH_ISSUER,
    audience: process.env.AUTH_AUDIENCE,
  });
  if (!payload.sub) {
    const error = new Error("Authentication token has no subject");
    error.status = 401;
    throw error;
  }
  return {
    subject: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    name: typeof payload.name === "string" ? payload.name : typeof payload.email === "string" ? payload.email : "Merchant",
  };
}
