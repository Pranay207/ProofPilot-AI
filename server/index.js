import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { SAMPLE_CASES } from "../src/lib/sampleData.js";
import { EVIDENCE_LABELS, getRequired, scoreCase } from "../src/lib/ruleEngine.js";

const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 4000);
const useDatabase = process.env.USE_DATABASE === "true";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "..", "dist");
let prisma = null;
let localCases = SAMPLE_CASES.map((item) => ({ ...item, id: item.case_id }));

app.use(cors());

app.post("/api/webhooks/razorpay", express.raw({ type: "application/json" }), async (req, res, next) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      return res.status(503).json({ ok: false, error: "RAZORPAY_WEBHOOK_SECRET is not configured" });
    }

    const signature = req.headers["x-razorpay-signature"];
    if (!signature) {
      return res.status(400).json({ ok: false, error: "Missing x-razorpay-signature" });
    }

    const expected = crypto.createHmac("sha256", secret).update(req.body).digest("hex");
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(String(signature));
    const valid = expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    if (!valid) {
      return res.status(400).json({ ok: false, error: "Invalid Razorpay signature" });
    }

    const payload = JSON.parse(req.body.toString("utf8"));
    const allowedEvents = new Set([
      "payment.captured",
      "payment.failed",
      "refund.processed",
      "refund.failed",
      "payment.dispute.created",
      "payment.dispute.won",
      "payment.dispute.lost",
      "payment.dispute.closed",
    ]);

    if (!allowedEvents.has(payload.event)) {
      return res.json({ ok: true, ignored: true, event: payload.event });
    }

    if (payload.event !== "payment.dispute.created") {
      return res.json({ ok: true, received: true, event: payload.event, created_case: false });
    }

    const created = await createCaseFromRazorpayDispute(payload);
    return res.json({ ok: true, received: true, event: payload.event, created_case: created.created, case_id: created.case_id });
  } catch (error) {
    next(error);
  }
});

app.use(express.json());

async function getPrisma() {
  if (!useDatabase) return null;
  if (prisma) return prisma;
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  return prisma;
}

function cleanText(value) {
  if (typeof value !== "string") return value;
  return value
    .replaceAll("\u20B9", "INR ")
    .replaceAll("\u00B7", "|")
    .replaceAll("\u2014", "-")
    .replaceAll("\u00D7", "x")
    .replaceAll("\u2212", "-")
    .replaceAll("\u201C", '"')
    .replaceAll("\u201D", '"')
    .replaceAll("\u2018", "'")
    .replaceAll("\u2019", "'");
}

function toFrontendCase(row) {
  const evidence = row.evidenceItems || [];
  const item = {
    id: row.caseId,
    case_id: row.caseId,
    payment_id: row.paymentId,
    order_id: row.orderId,
    dispute_id: row.disputeId,
    refund_id: row.refundId || "",
    arn: row.arn || "",
    rrn: row.rrn || "",
    utr: row.utr || "",
    customer_name: row.customerName,
    customer_email: row.customerEmail || "",
    amount: Math.round(row.amountPaise / 100),
    currency: row.currency,
    payment_status: cleanText(row.paymentStatus),
    refund_status: cleanText(row.refundStatus),
    delivery_status: cleanText(row.deliveryStatus),
    dispute_type: row.disputeType,
    dispute_reason: cleanText(row.disputeReason),
    risk_score: row.riskScore,
    readiness_score: row.readinessScore,
    confidence_score: row.confidenceScore,
    customer_message: cleanText(row.customerMessage),
    case_summary: cleanText(row.caseSummary),
    available_evidence: evidence.filter((item) => item.status === "available").map((item) => item.key),
    missing_evidence: evidence.filter((item) => item.status === "missing").map((item) => item.key),
    timeline_events: (row.timelineEvents || [])
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((item) => ({ event: cleanText(item.event), timestamp: item.timestamp, status: item.status, detail: cleanText(item.detail) })),
    recommended_action: row.recommendedAction,
    action_reason: cleanText(row.actionReason),
    deadline: row.deadline?.toISOString?.().slice(0, 10) || row.deadline,
    owner: cleanText(row.owner),
    team: cleanText(row.team),
    packet_status: row.packetStatus,
    merchant_response_draft: cleanText(row.merchantResponseDraft),
    audit_log: (row.auditLogs || [])
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((item) => ({ timestamp: item.timestamp, actor: cleanText(item.actor), action: cleanText(item.action), detail: cleanText(item.detail) })),
  };
  return { ...item, ...scoreCase(item) };
}

async function getCaseByParam(db, id) {
  return db.case.findFirst({
    where: { OR: [{ id }, { caseId: id }] },
    include: { evidenceItems: true, timelineEvents: true, auditLogs: true },
  });
}

function addAudit(caseItem, actor, action, detail) {
  return {
    ...caseItem,
    audit_log: [
      ...(caseItem.audit_log || []),
      { timestamp: new Date().toISOString(), actor, action, detail },
    ],
  };
}

const DEFAULT_BY_TYPE = {
  goods_not_received: {
    disputeReason: "Customer claims goods not received",
    customerMessage: "I never received my order even though it shows shipped. I want a refund.",
    paymentStatus: "captured",
    refundStatus: "none",
    deliveryStatus: "shipped_no_proof",
  },
  refund_not_processed: {
    disputeReason: "Customer claims refund not received",
    customerMessage: "The merchant promised a refund but I have not received it yet.",
    paymentStatus: "captured",
    refundStatus: "promised_not_processed",
    deliveryStatus: "not_applicable",
  },
  duplicate_payment: {
    disputeReason: "Customer claims duplicate payment",
    customerMessage: "I was charged twice for the same order. Please reverse one payment.",
    paymentStatus: "captured",
    refundStatus: "none",
    deliveryStatus: "not_applicable",
  },
  unauthorized_transaction: {
    disputeReason: "Customer claims payment was unauthorized",
    customerMessage: "I did not authorize this payment and want the charge reversed.",
    paymentStatus: "captured",
    refundStatus: "none",
    deliveryStatus: "digital_or_physical_fulfilled",
  },
  product_not_as_described: {
    disputeReason: "Customer claims product was not as described",
    customerMessage: "The item I received does not match the listing and I want a refund.",
    paymentStatus: "captured",
    refundStatus: "none",
    deliveryStatus: "delivered",
  },
  cancelled_subscription: {
    disputeReason: "Customer claims subscription was cancelled before charge",
    customerMessage: "I cancelled my subscription but was still charged again.",
    paymentStatus: "captured",
    refundStatus: "none",
    deliveryStatus: "not_applicable",
  },
};

function buildCasePayload(body, currentCount = 0) {
  const disputeType = body.dispute_type || "goods_not_received";
  const defaults = DEFAULT_BY_TYPE[disputeType] || DEFAULT_BY_TYPE.goods_not_received;
  const available = body.available_evidence || [];
  const required = getRequired(disputeType);
  const missing = required.filter((key) => !available.includes(key));
  const caseId = body.case_id || `PP-2026-${String(currentCount + 1).padStart(4, "0")}-${Date.now().toString().slice(-3)}`;
  const draft = body.merchant_response_draft || "We acknowledge the customer claim. Our team is reviewing payment, refund, delivery, and communication evidence before taking a final action.";
  const frontendCase = {
    id: caseId,
    case_id: caseId,
    payment_id: body.payment_id || `pay_${Date.now().toString().slice(-10)}`,
    order_id: body.order_id || `ord_${Date.now().toString().slice(-10)}`,
    dispute_id: body.dispute_id || `dsp_${Date.now().toString().slice(-8)}`,
    refund_id: body.refund_id || "",
    arn: body.arn || "",
    rrn: body.rrn || "",
    utr: body.utr || "",
    customer_name: body.customer_name || "New Customer",
    customer_email: body.customer_email || "",
    amount: Number(body.amount || 999),
    currency: "INR",
    payment_status: body.payment_status || defaults.paymentStatus,
    refund_status: body.refund_status || defaults.refundStatus,
    delivery_status: body.delivery_status || defaults.deliveryStatus,
    dispute_type: disputeType,
    dispute_reason: body.dispute_reason || defaults.disputeReason,
    risk_score: 0,
    readiness_score: 0,
    confidence_score: 0,
    customer_message: body.customer_message || defaults.customerMessage,
    case_summary: body.case_summary || `${(body.dispute_type || disputeType).replace(/_/g, " ")} case created from merchant input.`,
    available_evidence: available,
    missing_evidence: missing,
    timeline_events: [
      { event: "payment.captured", timestamp: new Date().toISOString(), status: "ok", detail: `INR ${Number(body.amount || 999).toLocaleString("en-IN")} captured` },
      { event: "proofpilot.case.created", timestamp: new Date().toISOString(), status: "alert", detail: "Evidence passport created from merchant input" },
    ],
    recommended_action: "escalate",
    action_reason: "New case created. Awaiting proof readiness evaluation.",
    deadline: body.deadline || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    owner: body.owner || "Ops Reviewer",
    team: body.team || "Operations",
    packet_status: "draft",
    merchant_response_draft: draft,
    audit_log: [{ timestamp: new Date().toISOString(), actor: "Merchant Ops", action: "case_created", detail: "Case added in ProofPilot AI" }],
  };
  return { ...frontendCase, ...scoreCase(frontendCase) };
}

function mapRazorpayDisputeType(dispute = {}) {
  const reason = `${dispute.reason_code || ""} ${dispute.reason_description || ""}`.toLowerCase();
  if (reason.includes("refund") || reason.includes("credit")) return "refund_not_processed";
  if (reason.includes("duplicate") || reason.includes("twice")) return "duplicate_payment";
  if (reason.includes("unauthor") || reason.includes("fraud")) return "unauthorized_transaction";
  if (reason.includes("not as described") || reason.includes("defective") || reason.includes("quality")) return "product_not_as_described";
  if (reason.includes("subscription") || reason.includes("cancel")) return "cancelled_subscription";
  return "goods_not_received";
}

function razorpayDisputeToCaseInput(payload) {
  const dispute = payload?.payload?.dispute?.entity || {};
  const payment = payload?.payload?.payment?.entity || {};
  if (!dispute.id) {
    const error = new Error("Razorpay dispute payload missing dispute id");
    error.status = 422;
    throw error;
  }

  const disputeType = mapRazorpayDisputeType(dispute);
  const amountPaise = Number(dispute.amount || payment.amount || 99900);
  const respondBy = dispute.respond_by ? new Date(Number(dispute.respond_by) * 1000) : new Date(Date.now() + 7 * 86400000);

  return {
    case_id: `PP-${dispute.id}`,
    payment_id: dispute.payment_id || payment.id || `pay_webhook_${Date.now().toString().slice(-8)}`,
    order_id: payment.order_id || dispute.order_id || `ord_webhook_${Date.now().toString().slice(-8)}`,
    dispute_id: dispute.id,
    customer_name: payment.email || payment.contact || "Razorpay customer",
    customer_email: payment.email || "",
    amount: Math.round(amountPaise / 100),
    dispute_type: disputeType,
    dispute_reason: dispute.reason_description || dispute.reason_code || "Razorpay dispute created",
    customer_message: dispute.reason_description || `Razorpay dispute ${dispute.id} created and requires evidence response.`,
    payment_status: payment.status || "captured",
    refund_status: "none",
    delivery_status: disputeType === "goods_not_received" ? "shipped_no_proof" : "not_applicable",
    available_evidence: ["payment receipt", "customer communication"],
    deadline: respondBy.toISOString().slice(0, 10),
    owner: "Webhook Intake",
    team: "Risk Ops",
    case_summary: `Imported from signed Razorpay webhook ${payload.event}. ProofPilot created a chargeback evidence response case.`,
    merchant_response_draft: "We acknowledge the dispute raised through Razorpay. ProofPilot is reviewing payment, refund, fulfilment, communication, and policy evidence before a human-approved response is submitted.",
  };
}

async function createCaseFromRazorpayDispute(payload) {
  const input = razorpayDisputeToCaseInput(payload);
  const db = await getPrisma();

  if (!db) {
    const existing = localCases.find((item) => item.dispute_id === input.dispute_id);
    if (existing) return { created: false, case_id: existing.case_id };
    const created = buildCasePayload(input, localCases.length);
    const withAudit = addAudit(created, "Razorpay Webhook", "webhook_received", `Created from ${payload.event}`);
    localCases = [withAudit, ...localCases];
    return { created: true, case_id: withAudit.case_id };
  }

  const existing = await db.case.findUnique({ where: { disputeId: input.dispute_id } });
  if (existing) return { created: false, case_id: existing.caseId };

  const count = await db.case.count();
  const item = buildCasePayload(input, count);
  const merchant = await db.merchant.upsert({
    where: { email: "ops@kova-commerce.example" },
    update: { name: "Kova Commerce Demo" },
    create: { name: "Kova Commerce Demo", email: "ops@kova-commerce.example" },
  });

  const created = await db.case.create({
    data: {
      caseId: item.case_id,
      merchantId: merchant.id,
      paymentId: item.payment_id,
      orderId: item.order_id,
      disputeId: item.dispute_id,
      refundId: item.refund_id || null,
      arn: item.arn || null,
      rrn: item.rrn || null,
      utr: item.utr || null,
      customerName: item.customer_name,
      customerEmail: item.customer_email || null,
      amountPaise: item.amount * 100,
      currency: item.currency,
      paymentStatus: item.payment_status,
      refundStatus: item.refund_status,
      deliveryStatus: item.delivery_status,
      disputeType: item.dispute_type,
      disputeReason: item.dispute_reason,
      riskScore: item.risk_score,
      readinessScore: item.readiness_score,
      confidenceScore: item.confidence_score,
      customerMessage: item.customer_message,
      caseSummary: item.case_summary,
      recommendedAction: item.recommended_action,
      actionReason: item.action_reason,
      deadline: new Date(item.deadline),
      owner: item.owner,
      team: item.team,
      packetStatus: item.packet_status,
      merchantResponseDraft: item.merchant_response_draft,
      evidenceItems: {
        create: [...new Set([...item.available_evidence, ...item.missing_evidence])].map((key) => ({
          key,
          label: EVIDENCE_LABELS[key] || key,
          status: item.available_evidence.includes(key) ? "available" : "missing",
        })),
      },
      timelineEvents: {
        create: [
          ...item.timeline_events,
          {
            event: payload.event,
            timestamp: new Date().toISOString(),
            status: "alert",
            detail: `Razorpay dispute webhook received for ${item.dispute_id}`,
          },
        ].map((event) => ({
          event: event.event,
          timestamp: new Date(event.timestamp),
          status: event.status,
          detail: event.detail,
        })),
      },
      auditLogs: {
        create: [
          ...item.audit_log,
          { timestamp: new Date().toISOString(), actor: "Razorpay Webhook", action: "webhook_received", detail: `Created from ${payload.event}` },
        ].map((log) => ({
          timestamp: new Date(log.timestamp),
          actor: log.actor,
          action: log.action,
          detail: log.detail,
        })),
      },
    },
  });

  return { created: true, case_id: created.caseId };
}

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

function getRazorpayConfig() {
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

async function callRazorpay(path) {
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
    const error = new Error(body?.error?.description || `Razorpay API error ${response.status}`);
    error.status = response.status;
    error.code = body?.error?.code;
    throw error;
  }
  return body;
}

function normalizePayment(payment) {
  if (!payment) return null;
  return {
    id: payment.id,
    order_id: payment.order_id || "",
    amount: Math.round(Number(payment.amount || 0) / 100),
    currency: payment.currency,
    status: payment.status,
    method: payment.method,
    email: payment.email || "",
    contact: payment.contact || "",
    captured: Boolean(payment.captured),
    created_at: payment.created_at,
  };
}

function normalizeDispute(dispute) {
  if (!dispute) return null;
  return {
    id: dispute.id,
    payment_id: dispute.payment_id,
    amount: Math.round(Number(dispute.amount || 0) / 100),
    currency: dispute.currency,
    status: dispute.status,
    phase: dispute.phase,
    reason_code: dispute.reason_code,
    reason_description: dispute.reason_description,
    respond_by: dispute.respond_by,
    created_at: dispute.created_at,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: useDatabase ? "postgres" : "local-sample-data" });
});

app.get("/api/integrations/razorpay/status", (_req, res) => {
  const config = getRazorpayConfig();
  res.json({
    configured: config.configured,
    mode: config.mode,
    key_id: config.maskedKeyId,
    webhook_secret_configured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
  });
});

app.get("/api/integrations/razorpay/payments/:id", async (req, res, next) => {
  try {
    const payment = await callRazorpay(`/payments/${encodeURIComponent(req.params.id)}`);
    res.json({ ok: true, payment: normalizePayment(payment) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/integrations/razorpay/disputes", async (req, res, next) => {
  try {
    const count = Math.min(Number(req.query.count || 10), 50);
    const data = await callRazorpay(`/disputes?count=${count}`);
    res.json({ ok: true, count: data.count || 0, disputes: (data.items || []).map(normalizeDispute) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/integrations/razorpay/disputes/:id", async (req, res, next) => {
  try {
    const dispute = await callRazorpay(`/disputes/${encodeURIComponent(req.params.id)}`);
    res.json({ ok: true, dispute: normalizeDispute(dispute) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/cases", async (_req, res, next) => {
  try {
    const db = await getPrisma();
    if (!db) return res.json(localCases);
    const rows = await db.case.findMany({
      orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }],
      include: { evidenceItems: true, timelineEvents: true, auditLogs: true },
    });
    res.json(rows.map(toFrontendCase));
  } catch (error) {
    next(error);
  }
});

app.post("/api/cases", async (req, res, next) => {
  try {
    const db = await getPrisma();
    if (!db) {
      const created = buildCasePayload(req.body, localCases.length);
      localCases = [created, ...localCases];
      return res.status(201).json(created);
    }

    const count = await db.case.count();
    const item = buildCasePayload(req.body, count);
    const merchant = await db.merchant.upsert({
      where: { email: "ops@kova-commerce.example" },
      update: { name: "Kova Commerce Demo" },
      create: { name: "Kova Commerce Demo", email: "ops@kova-commerce.example" },
    });

    const created = await db.case.create({
      data: {
        caseId: item.case_id,
        merchantId: merchant.id,
        paymentId: item.payment_id,
        orderId: item.order_id,
        disputeId: item.dispute_id,
        refundId: item.refund_id || null,
        arn: item.arn || null,
        rrn: item.rrn || null,
        utr: item.utr || null,
        customerName: item.customer_name,
        customerEmail: item.customer_email || null,
        amountPaise: item.amount * 100,
        currency: item.currency,
        paymentStatus: item.payment_status,
        refundStatus: item.refund_status,
        deliveryStatus: item.delivery_status,
        disputeType: item.dispute_type,
        disputeReason: item.dispute_reason,
        riskScore: item.risk_score,
        readinessScore: item.readiness_score,
        confidenceScore: item.confidence_score,
        customerMessage: item.customer_message,
        caseSummary: item.case_summary,
        recommendedAction: item.recommended_action,
        actionReason: item.action_reason,
        deadline: new Date(item.deadline),
        owner: item.owner,
        team: item.team,
        packetStatus: item.packet_status,
        merchantResponseDraft: item.merchant_response_draft,
        evidenceItems: {
          create: [...new Set([...item.available_evidence, ...item.missing_evidence])].map((key) => ({
            key,
            label: EVIDENCE_LABELS[key] || key,
            status: item.available_evidence.includes(key) ? "available" : "missing",
          })),
        },
        timelineEvents: {
          create: item.timeline_events.map((event) => ({
            event: event.event,
            timestamp: new Date(event.timestamp),
            status: event.status,
            detail: event.detail,
          })),
        },
        auditLogs: {
          create: item.audit_log.map((log) => ({
            timestamp: new Date(log.timestamp),
            actor: log.actor,
            action: log.action,
            detail: log.detail,
          })),
        },
      },
      include: { evidenceItems: true, timelineEvents: true, auditLogs: true },
    });

    res.status(201).json(toFrontendCase(created));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/cases/:id/evidence", async (req, res, next) => {
  try {
    const { evidenceKey, fileName } = req.body;
    const db = await getPrisma();
    if (!db) {
      localCases = localCases.map((caseItem) => {
        if (caseItem.id !== req.params.id && caseItem.case_id !== req.params.id) return caseItem;
        const available = [...new Set([...(caseItem.available_evidence || []), evidenceKey])];
        const missing = (caseItem.missing_evidence || []).filter((item) => item !== evidenceKey);
        const updated = { ...caseItem, available_evidence: available, missing_evidence: missing };
        const scores = scoreCase(updated);
        return addAudit(
          { ...updated, ...scores },
          "Evidence Radar",
          "evidence_attached",
          `Attached ${evidenceKey}${fileName ? ` (${fileName})` : ""}`,
        );
      });
      return res.json(localCases.find((item) => item.id === req.params.id || item.case_id === req.params.id));
    }

    const caseRow = await getCaseByParam(db, req.params.id);
    if (!caseRow) return res.status(404).json({ error: "Case not found" });
    await db.evidenceItem.upsert({
      where: { caseId_key: { caseId: caseRow.id, key: evidenceKey } },
      update: { status: "available", fileName, attachedAt: new Date() },
      create: { caseId: caseRow.id, key: evidenceKey, label: evidenceKey, status: "available", fileName, attachedAt: new Date() },
    });

    const refreshed = await getCaseByParam(db, req.params.id);
    const mapped = toFrontendCase(refreshed);
    const scores = scoreCase(mapped);
    await db.case.update({
      where: { id: refreshed.id },
      data: {
        riskScore: scores.risk_score,
        readinessScore: scores.readiness_score,
        confidenceScore: scores.confidence_score,
        recommendedAction: scores.recommended_action,
        actionReason: scores.action_reason,
      },
    });
    await db.auditLog.create({ data: { caseId: refreshed.id, actor: "Evidence Radar", action: "evidence_attached", detail: `Attached ${evidenceKey}` } });
    const finalRow = await getCaseByParam(db, req.params.id);
    res.json(toFrontendCase(finalRow));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/cases/:id/draft", async (req, res, next) => {
  try {
    const { draft } = req.body;
    const db = await getPrisma();
    if (!db) {
      localCases = localCases.map((caseItem) => {
        if (caseItem.id !== req.params.id && caseItem.case_id !== req.params.id) return caseItem;
        return addAudit({ ...caseItem, merchant_response_draft: draft }, "Human Reviewer", "edited", "Merchant response draft edited by human");
      });
      return res.json(localCases.find((item) => item.id === req.params.id || item.case_id === req.params.id));
    }

    const caseRow = await getCaseByParam(db, req.params.id);
    if (!caseRow) return res.status(404).json({ error: "Case not found" });
    await db.case.update({ where: { id: caseRow.id }, data: { merchantResponseDraft: draft } });
    await db.auditLog.create({ data: { caseId: caseRow.id, actor: "Human Reviewer", action: "edited", detail: "Merchant response draft edited by human" } });
    const finalRow = await getCaseByParam(db, req.params.id);
    res.json(toFrontendCase(finalRow));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/cases/:id/decision", async (req, res, next) => {
  try {
    const { status } = req.body;
    const db = await getPrisma();
    if (!db) {
      localCases = localCases.map((caseItem) => {
        if (caseItem.id !== req.params.id && caseItem.case_id !== req.params.id) return caseItem;
        return addAudit({ ...caseItem, packet_status: status }, "Human Reviewer", status, `Packet ${status}`);
      });
      return res.json(localCases.find((item) => item.id === req.params.id || item.case_id === req.params.id));
    }

    const caseRow = await getCaseByParam(db, req.params.id);
    if (!caseRow) return res.status(404).json({ error: "Case not found" });
    await db.case.update({ where: { id: caseRow.id }, data: { packetStatus: status } });
    await db.auditLog.create({ data: { caseId: caseRow.id, actor: "Human Reviewer", action: status, detail: `Packet ${status}` } });
    const finalRow = await getCaseByParam(db, req.params.id);
    res.json(toFrontendCase(finalRow));
  } catch (error) {
    next(error);
  }
});

app.post("/api/cases/:id/export", async (req, res, next) => {
  try {
    const db = await getPrisma();
    if (!db) {
      localCases = localCases.map((caseItem) => {
        if (caseItem.id !== req.params.id && caseItem.case_id !== req.params.id) return caseItem;
        return addAudit(caseItem, "ProofPilot Export", "packet_exported", `Exported dispute packet for ${caseItem.order_id}`);
      });
      return res.json(localCases.find((item) => item.id === req.params.id || item.case_id === req.params.id));
    }

    const caseRow = await getCaseByParam(db, req.params.id);
    if (!caseRow) return res.status(404).json({ error: "Case not found" });
    await db.auditLog.create({
      data: {
        caseId: caseRow.id,
        actor: "ProofPilot Export",
        action: "packet_exported",
        detail: `Exported dispute packet for ${caseRow.orderId}`,
      },
    });
    const finalRow = await getCaseByParam(db, req.params.id);
    res.json(toFrontendCase(finalRow));
  } catch (error) {
    next(error);
  }
});

app.use(express.static(distDir));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "ProofPilot API error", detail: error.message });
});

app.listen(port, () => {
  console.log(`ProofPilot API running on http://localhost:${port} (${useDatabase ? "postgres" : "local sample data"})`);
});
