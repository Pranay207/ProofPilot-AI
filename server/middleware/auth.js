import { createRemoteJWKSet, jwtVerify } from "jose";

// ProofPilot Auth Middleware
// Supports:
//   - DEMO_MODE bypass (DEMO_MODE=true) — fixed demo merchant for judges/demos
//   - Dev bypass (NODE_ENV != production, no JWKS configured)
//   - Production JWKS/JWT verification (Auth0, Clerk, any OIDC provider)
//   - Role extraction from JWT (payload.roles or custom namespace)
//   - Simple in-memory rate limiting for sensitive endpoints

const jwksUrl = process.env.AUTH_JWKS_URL;
const jwks = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null;
const isDemoMode = process.env.DEMO_MODE === "true";

// In-memory rate limit store (resets on server restart — use Redis in production for multi-instance)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 60); // 60 requests/min default

/**
 * Extract roles from JWT payload.
 * Supports Auth0 custom claims namespace and standard `roles` field.
 */
function extractRoles(payload) {
  const namespace = process.env.AUTH_ROLES_NAMESPACE || "https://proofpilot.ai";
  const fromNamespace = payload[`${namespace}/roles`];
  const fromRoles = payload.roles;
  const roles = Array.isArray(fromNamespace) ? fromNamespace : Array.isArray(fromRoles) ? fromRoles : [];
  return roles;
}

/**
 * Check and enforce rate limit for a given key (usually IP or subject).
 * Returns { allowed, remaining, resetAt }.
 */
export function checkRateLimit(key) {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  entry.count += 1;
  const remaining = Math.max(0, RATE_LIMIT_MAX - entry.count);
  return { allowed: entry.count <= RATE_LIMIT_MAX, remaining, resetAt: entry.resetAt };
}

/**
 * Rate limiting middleware factory.
 * Apply to sensitive endpoints (decision, submit).
 */
export function rateLimit(options = {}) {
  const max = options.max || RATE_LIMIT_MAX;
  return (req, res, next) => {
    const key = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", max - 1);
      res.setHeader("X-RateLimit-Reset", Math.ceil((now + RATE_LIMIT_WINDOW_MS) / 1000));
      return next();
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      return res.status(429).json({
        error: "Too many requests. Please slow down.",
        retry_after_seconds: Math.ceil((entry.resetAt - now) / 1000),
      });
    }

    next();
  };
}

/**
 * Authenticate an incoming API request.
 * Returns a normalized auth object: { subject, email, name, roles }.
 */
export async function authenticateRequest(req) {
  // DEMO_MODE: use configured merchant or fixed demo merchant identity
  if (isDemoMode) {
    return {
      subject: process.env.RAZORPAY_MERCHANT_AUTH_SUBJECT || "demo-merchant-001",
      email: process.env.RAZORPAY_MERCHANT_EMAIL || "demo@proofpilot.ai",
      name: process.env.RAZORPAY_MERCHANT_NAME || "Demo Merchant",
      roles: ["merchant", "reviewer"],
      mode: "demo",
    };
  }

  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

  // Dev bypass: no JWT configured and not in production
  if (!token && process.env.NODE_ENV !== "production" && !jwks) {
    return {
      subject: process.env.DEV_AUTH_SUBJECT || "dev-merchant",
      email: "dev@example.invalid",
      name: "Development Merchant",
      roles: ["merchant", "reviewer"],
      mode: "dev",
    };
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
    name:
      typeof payload.name === "string"
        ? payload.name
        : typeof payload.email === "string"
          ? payload.email
          : "Merchant",
    roles: extractRoles(payload),
    mode: "jwt",
  };
}
