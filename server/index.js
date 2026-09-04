import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { SAMPLE_CASES } from "../src/lib/sampleData.js";
import { EVIDENCE_LABELS, getRequired, scoreCase } from "../src/lib/ruleEngine.js";
import { RAZORPAY_EVIDENCE_FIELDS } from "../src/lib/razorpayEvidenceMapper.js";
import { buildFallbackAiJudgment, safeParseAiJson, validateAiCaseJudgment } from "../src/lib/aiGuardrails.js";
import { buildAiJudgment } from "../src/lib/aiJudgment.js";
import { buildWorkflowSnapshot, deriveCaseState, FAILURE_STATES } from "../src/lib/workflow.js";
import { buildEvaluationResponse, buildMetricsResponse } from "./services/metricsService.js";
import { buildDisputePacketPdf } from "./services/pdfExportService.js";
import { validateDecisionStatus, ensureContestHasEvidence, ensureReadinessThreshold } from "./services/decisionService.js";
import { applyPersistedEvidenceToCase, persistConnectorEvidence } from "./services/evidencePersistenceService.js";
import { scoreAndClassifyCase } from "./services/riskScoringService.js";
import { registerArchitectureRoutes } from "./routes/architecture.js";
import {
  extractWebhookIds as readWebhookIds,
  getPayloadHash,
  getWebhookEntity as readWebhookEntity,
  recordWebhookEvent,
  RAZORPAY_ALLOWED_WEBHOOK_EVENTS,
} from "./services/webhookIdempotencyService.js";
import { callRazorpay as requestRazorpay, getRazorpayConfig as readRazorpayConfig } from "./integrations/razorpayClient.js";
import { deleteEvidenceUpload, findEvidenceUpload, readEvidenceUpload, saveEvidenceUpload } from "./services/evidenceService.js";
import { acceptRazorpayDispute, contestRazorpayDispute, uploadRazorpayDocument } from "./integrations/razorpayClient.js";
import { authenticateRequest, rateLimit } from "./middleware/auth.js";
import { getQueueHealth, addJob, QUEUE_NAMES, JOB_TYPES } from "./queue/queueClient.js";
import { autoCollectEvidence, getConnectorStatus } from "./connectors/connectorRegistry.js";
import { syncShiprocketTracking } from "./connectors/shiprocketConnector.js";
import { connectorRouter } from "./routes/connectors.js";
import { startWorkers } from "./queue/workers.js";

export const app = express();
app.disable("x-powered-by");
const port = Number(process.env.PORT || process.env.API_PORT || 4000);
const useDatabase = process.env.USE_DATABASE === "true";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "..", "dist");
let prisma = null;
let localCases = SAMPLE_CASES.map((item) => ({ ...item, id: item.case_id }));
const localWebhookEvents = new Map();

app.post("/api/webhooks/razorpay", express.raw({ type: "application/json" }), async (req, res, next) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      return res.status(503).json({
        ok: false,
        error: "Webhook secret is not configured",
        failure_state: FAILURE_STATES.NEEDS_MANUAL_REVIEW,
      });
    }

    const signature = req.headers["x-razorpay-signature"];
    if (!signature) {
      return res.status(400).json({
        ok: false,
        error: "Missing webhook signature",
        failure_state: FAILURE_STATES.WEBHOOK_SIGNATURE_FAILED,
      });
    }

    const expected = crypto.createHmac("sha256", secret).update(req.body).digest("hex");
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(String(signature));
    const valid = expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    if (!valid) {
      return res.status(400).json({
        ok: false,
        error: "Invalid Razorpay signature",
        failure_state: FAILURE_STATES.WEBHOOK_SIGNATURE_FAILED,
      });
    }

    const payload = JSON.parse(req.body.toString("utf8"));

    if (!RAZORPAY_ALLOWED_WEBHOOK_EVENTS.has(payload.event)) {
      return res.json({ ok: true, ignored: true, event: payload.event });
    }

    const webhookMerchant = await getWebhookMerchant();
    const intake = await recordRazorpayWebhook(payload, req.body, webhookMerchant?.id);
    if (intake.duplicate) {
      return res.json({
        ok: true,
        received: true,
        duplicate: true,
        failure_state: FAILURE_STATES.WEBHOOK_DUPLICATE,
        message: "Duplicate Razorpay webhook ignored safely.",
        event: payload.event,
        payment_signal: intake.payment_id || null,
        case_id: intake.case_id || null,
        webhook_event: intake.audit || null,
      });
    }

    await upsertPaymentSignalFromWebhook(payload, webhookMerchant?.id);

    if (!String(payload.event || "").startsWith("payment.dispute.")) {
      return res.json({
        ok: true,
        received: true,
        event: payload.event,
        stored_event: intake.stored,
        payment_signal: intake.payment_id || null,
        webhook_event: intake.audit || null,
        created_case: false,
        updated_case: false,
      });
    }

    const processed = await upsertCaseFromRazorpayDispute(payload, webhookMerchant);
    await markWebhookCaseCreated(payload, req.body, processed.case_id);
    return res.json({
      ok: true,
      received: true,
      event: payload.event,
      stored_event: intake.stored,
      payment_signal: intake.payment_id || null,
      webhook_event: intake.audit || null,
      created_case: processed.created,
      updated_case: processed.updated,
      case_id: processed.case_id,
      lifecycle_status: processed.lifecycle_status,
    });
  } catch (error) {
    next(error);
  }
});

app.use(express.json({ limit: "6mb" }));

async function getPrisma() {
  if (!useDatabase) return null;
  if (prisma) return prisma;
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  return prisma;
}

async function getWebhookMerchant() {
  const db = await getPrisma();
  if (!db) return null;
  const authSubject = process.env.RAZORPAY_MERCHANT_AUTH_SUBJECT;
  if (!authSubject) {
    const error = new Error("RAZORPAY_MERCHANT_AUTH_SUBJECT is required for webhook routing");
    error.status = 503;
    throw error;
  }
  return db.merchant.upsert({
    where: { authSubject },
    update: {},
    create: {
      authSubject,
      name: process.env.RAZORPAY_MERCHANT_NAME || "Razorpay Merchant",
      email: process.env.RAZORPAY_MERCHANT_EMAIL || null,
    },
  });
}

async function attachMerchant(req) {
  const db = await getPrisma();
  if (!db) return null;
  
  let merchant = await db.merchant.findUnique({
    where: { authSubject: req.auth.subject },
  });

  if (!merchant) {
    const isEnvSubject = req.auth.subject === process.env.RAZORPAY_MERCHANT_AUTH_SUBJECT;
    const merchantName = isEnvSubject ? (process.env.RAZORPAY_MERCHANT_NAME || req.auth.name || "Merchant") : (req.auth.name || "Merchant");
    const rawEmail = isEnvSubject ? (process.env.RAZORPAY_MERCHANT_EMAIL || req.auth.email || null) : (req.auth.email || null);

    let finalEmail = rawEmail;
    if (finalEmail) {
      const emailExists = await db.merchant.findUnique({ where: { email: finalEmail } });
      if (emailExists) {
        finalEmail = `${req.auth.subject.replace(/[^a-zA-Z0-9]/g, "_")}@proofpilot.local`;
      }
    }

    merchant = await db.merchant.create({
      data: {
        authSubject: req.auth.subject,
        name: merchantName,
        email: finalEmail,
      },
    });
  }

  req.merchant = merchant;
  return merchant;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mode: useDatabase ? "postgres" : "local-sample-data",
    product: "ProofPilot AI",
    workflow: "signed webhook -> risk score -> proof checklist -> response draft -> human decision -> audit trail",
  });
});

// API middleware - authenticates requests and attaches merchant data
app.use("/api", async (req, _res, next) => {
  const url = req.originalUrl || req.url || "";
  const isPublicRoute = 
    url.startsWith("/api/reliability") ||
    url.startsWith("/api/evaluation") ||
    url.startsWith("/api/health") ||
    url.startsWith("/api/webhooks") ||
    (req.method === "GET" && url.startsWith("/api/cases"));

  if (isPublicRoute) {
    try {
      req.auth = await authenticateRequest(req);
      await attachMerchant(req);
    } catch {
      // Graceful fallback for public evaluator endpoints
    }
    return next();
  }

  try {
    req.auth = await authenticateRequest(req);
    await attachMerchant(req);
    next();
  } catch (error) {
    next(error);
  }
});

app.get("/api/merchant/profile", async (req, res, next) => {
  try {
    if (!req.merchant) {
      return res.status(401).json({ error: "Authentication required" });
    }
    res.json({
      ok: true,
      merchant: {
        id: req.merchant.id,
        name: req.merchant.name,
        email: req.merchant.email,
        auth_subject: req.merchant.authSubject,
        created_at: req.merchant.createdAt?.toISOString?.() || req.merchant.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

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

function deriveRazorpayDisputeStatus(packetStatus) {
  if (packetStatus === "approved" || packetStatus === "contested") return "under_review";
  if (packetStatus === "accepted") return "lost";
  if (packetStatus === "closed") return "closed";
  return "open";
}

const RAZORPAY_DISPUTE_EVENT_STATUS = {
  "payment.dispute.created": "open",
  "payment.dispute.under_review": "under_review",
  "payment.dispute.action_required": "open",
  "payment.dispute.won": "won",
  "payment.dispute.lost": "lost",
  "payment.dispute.closed": "closed",
};

const RAZORPAY_EVENT_PACKET_STATUS = {
  "payment.dispute.created": "draft",
  "payment.dispute.under_review": "contested",
  "payment.dispute.action_required": "escalated",
  "payment.dispute.won": "closed",
  "payment.dispute.lost": "closed",
  "payment.dispute.closed": "closed",
};

function getLifecycleStatusFromEvent(event, fallback = "open") {
  return RAZORPAY_DISPUTE_EVENT_STATUS[event] || fallback || "open";
}

function getPacketStatusFromEvent(event, fallback = "draft") {
  return RAZORPAY_EVENT_PACKET_STATUS[event] || fallback || "draft";
}

function getLatestRazorpayStatus(row) {
  const latest = [...(row.timelineEvents || [])]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .find((item) => RAZORPAY_DISPUTE_EVENT_STATUS[item.event]);
  if (latest) return RAZORPAY_DISPUTE_EVENT_STATUS[latest.event];
  return deriveRazorpayDisputeStatus(row.packetStatus);
}

function disputeStatusToWebhookEvent(status) {
  if (status === "under_review") return "payment.dispute.under_review";
  if (status === "won") return "payment.dispute.won";
  if (status === "lost") return "payment.dispute.lost";
  if (status === "closed") return "payment.dispute.closed";
  return "payment.dispute.created";
}

function toFrontendCase(row) {
  const evidence = row.evidenceItems || [];
  const evidenceFiles = evidence.reduce((files, item) => {
    if (item.fileName) {
      files[item.key] = {
        file_name: item.fileName,
        mime_type: item.mimeType,
        size_bytes: item.sizeBytes,
        storage_provider: item.storageProvider,
        storage_status: item.storageProvider === "s3" ? "Cloud storage" : item.storageProvider ? "Local storage" : "Attached",
        uploaded_at: item.attachedAt?.toISOString?.() || item.attachedAt,
        download_url: `/api/cases/${encodeURIComponent(row.caseId)}/evidence-files/${encodeURIComponent(item.key)}`,
      };
    }
    return files;
  }, {});
  const fileBackedEvidence = new Set(Object.keys(evidenceFiles));
  const persistedEvidence = evidence.reduce((records, item) => {
    const attachedAt = item.attachedAt?.toISOString?.() || item.attachedAt;
    if (item.status === "available" && attachedAt) {
      records[item.key] = {
        attached_at: attachedAt,
        status: item.status,
        source: item.fileName ? "upload" : "connector",
      };
    }
    return records;
  }, {});
  const requiredEvidence = getRequired(row.disputeType);
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
    amount_deducted: Number(row.amountDeducted || 0),
    reason_code: row.disputeType,
    reason_description: cleanText(row.disputeReason),
    respond_by: row.deadline?.toISOString?.().slice(0, 10) || row.deadline,
    status: getLatestRazorpayStatus(row),
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
    available_evidence: evidence.filter((item) => item.status === "available" && (fileBackedEvidence.has(item.key) || persistedEvidence[item.key])).map((item) => item.key),
    missing_evidence: requiredEvidence.filter((key) => !fileBackedEvidence.has(key) && !persistedEvidence[key]),
    evidence_files: evidenceFiles,
    persisted_evidence: persistedEvidence,
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
  const scored = scoreAndClassifyCase(item);
  // Attach formal workflow state to every case response
  scored.workflow_state = deriveCaseState(scored);
  scored.workflow = buildWorkflowSnapshot(scored);
  return scored;
}

async function getCaseByParam(db, id, merchantId) {
  let found = await db.case.findFirst({
    where: { OR: [{ id }, { caseId: id }], ...(merchantId ? { merchantId } : {}) },
    include: { evidenceItems: true, timelineEvents: true, auditLogs: true },
  });
  if (!found && process.env.DEMO_MODE === "true") {
    found = await db.case.findFirst({
      where: { OR: [{ id }, { caseId: id }] },
      include: { evidenceItems: true, timelineEvents: true, auditLogs: true },
    });
  }
  return found;
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

function isManualCase(caseItem) {
  const auditLogs = caseItem.auditLogs || caseItem.audit_log || [];
  return auditLogs.some((log) => log.actor === "Merchant Ops" && log.action === "case_created");
}

const BULK_ACTIONS = new Set(["approve", "reject", "archive", "assign"]);

function validateBulkActionBody(body = {}) {
  const caseIds = Array.isArray(body.caseIds) ? [...new Set(body.caseIds.map(String).filter(Boolean))] : [];
  const action = String(body.action || "");
  if (!caseIds.length) {
    const error = new Error("At least one case ID is required");
    error.status = 400;
    throw error;
  }
  if (!BULK_ACTIONS.has(action)) {
    const error = new Error("Bulk action must be approve, reject, archive, or assign");
    error.status = 400;
    throw error;
  }
  if (action === "assign" && !String(body.payload?.assignedTo || "").trim()) {
    const error = new Error("assignedTo is required for bulk assign");
    error.status = 400;
    throw error;
  }
  return { caseIds, action, payload: body.payload || {} };
}

function bulkCasePatch(action, payload = {}) {
  if (action === "approve") return { packet_status: "approved" };
  if (action === "reject") {
    return {
      packet_status: "escalated",
      recommended_action: "escalate",
      action_reason: "Bulk rejected by reviewer. Case requires follow-up before any external action.",
    };
  }
  if (action === "archive") return { packet_status: "closed" };
  if (action === "assign") return { owner: String(payload.assignedTo || "").trim() };
  return {};
}

function bulkCaseDbPatch(action, payload = {}) {
  const patch = bulkCasePatch(action, payload);
  return {
    ...("packet_status" in patch ? { packetStatus: patch.packet_status } : {}),
    ...("recommended_action" in patch ? { recommendedAction: patch.recommended_action } : {}),
    ...("action_reason" in patch ? { actionReason: patch.action_reason } : {}),
    ...("owner" in patch ? { owner: patch.owner } : {}),
  };
}

function bulkAuditDetail(action, payload = {}) {
  if (action === "assign") return `Bulk assigned to ${String(payload.assignedTo || "").trim()}`;
  if (action === "approve") return "Bulk approved for reviewer-controlled dispute workflow";
  if (action === "reject") return "Bulk rejected and routed for reviewer follow-up";
  return "Bulk archived from active dispute workflow";
}

function getWebhookFingerprint(rawBody) {
  return getPayloadHash(rawBody);
}

function getWebhookEntity(payload, key) {
  return readWebhookEntity(payload, key);
}

function fromRazorpayTimestamp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? new Date(numeric * 1000) : null;
}

function extractWebhookIds(payload) {
  return readWebhookIds(payload);
}

async function recordRazorpayWebhook(payload, rawBody, merchantId) {
  const db = await getPrisma();
  if (!db) {
    const payloadHash = getWebhookFingerprint(rawBody);
    const existing = localWebhookEvents.get(payloadHash);
    if (existing) {
      return {
        stored: false,
        duplicate: true,
        payment_id: existing.payment_id,
        dispute_id: existing.dispute_id,
        case_id: existing.case_id,
        payload_hash: payloadHash,
        audit: existing.audit,
      };
    }
    const ids = extractWebhookIds(payload);
    const audit = {
      event_id: `local_${payloadHash.slice(0, 12)}`,
      payment_id: ids.paymentId,
      event_type: payload.event,
      processed_at: new Date().toISOString(),
      payload_hash: payloadHash,
      status: "received",
      created_case_id: null,
    };
    localWebhookEvents.set(payloadHash, {
      payment_id: ids.paymentId,
      dispute_id: ids.disputeId,
      case_id: null,
      audit,
    });
    return {
      stored: true,
      mode: "memory",
      payment_id: ids.paymentId,
      dispute_id: ids.disputeId,
      payload_hash: payloadHash,
      audit,
    };
  }
  return recordWebhookEvent({ db, payload, rawBody, merchantId });
}

async function markWebhookCaseCreated(payload, rawBody, caseId) {
  const db = await getPrisma();
  if (!db) {
    const payloadHash = getWebhookFingerprint(rawBody);
    const existing = localWebhookEvents.get(payloadHash);
    if (existing) {
      existing.case_id = caseId;
      existing.audit = { ...existing.audit, status: "case_created", created_case_id: caseId };
      localWebhookEvents.set(payloadHash, existing);
    }
    return;
  }
  await db.webhookEvent.updateMany({
    where: { eventFingerprint: getWebhookFingerprint(rawBody) },
    data: { createdCaseId: caseId, status: "case_created" },
  });
}

async function upsertPaymentSignalFromWebhook(payload, merchantId) {
  const payment = getWebhookEntity(payload, "payment");
  if (!payment?.id) return null;

  const signal = {
    providerPaymentId: payment.id,
    orderId: payment.order_id || null,
    amountPaise: Number(payment.amount || 0),
    currency: payment.currency || "INR",
    status: payment.status || payload.event,
    method: payment.method || null,
    customerEmail: payment.email || null,
    customerContact: payment.contact || null,
    captured: Boolean(payment.captured || payment.status === "captured"),
    providerCreatedAt: fromRazorpayTimestamp(payment.created_at),
    lastWebhookEvent: payload.event || "razorpay.webhook",
  };

  const db = await getPrisma();
  if (!db) return signal;

  return db.paymentSignal.upsert({
    where: { providerPaymentId: payment.id },
    update: signal,
    create: { ...signal, merchantId },
  });
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
    dispute_id: body.dispute_id || `disp_${Date.now().toString().slice(-8)}`,
    refund_id: body.refund_id || "",
    arn: body.arn || "",
    rrn: body.rrn || "",
    utr: body.utr || "",
    customer_name: body.customer_name || "New Customer",
    customer_email: body.customer_email || "",
    amount: Number(body.amount || 999),
    currency: body.currency || "INR",
    amount_deducted: Number(body.amount_deducted || 0),
    reason_code: body.reason_code || disputeType,
    reason_description: body.reason_description || body.dispute_reason || defaults.disputeReason,
    respond_by: body.respond_by || body.deadline || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    status: body.status || "open",
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
    evidence_files: body.evidence_files || {},
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
  const scored = scoreAndClassifyCase(frontendCase);
  return {
    ...scored,
    merchant_response_draft: body.merchant_response_draft || scored.ai_judgment.response_draft,
  };
}

function attachWorkflow(cases) {
  return cases.map(scoreAndClassifyCase);
}

function buildEvaluationPayload(cases) {
  return buildEvaluationResponse(cases);
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
    amount_deducted: Math.round(Number(dispute.amount_deducted || 0) / 100),
    currency: dispute.currency || payment.currency || "INR",
    reason_code: dispute.reason_code || disputeType,
    reason_description: dispute.reason_description || dispute.reason_code || "Razorpay dispute created",
    respond_by: respondBy.toISOString().slice(0, 10),
    status: dispute.status || "open",
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

async function createCaseFromRazorpayDispute(payload, merchantOverride = null) {
  const input = razorpayDisputeToCaseInput(payload);
  const db = await getPrisma();

  if (!db) {
    const existing = localCases.find((item) => item.dispute_id === input.dispute_id);
    if (existing) return { created: false, case_id: existing.case_id };
    const created = {
      ...buildCasePayload(input, localCases.length),
      packet_status: getPacketStatusFromEvent(payload.event, "draft"),
      status: getLifecycleStatusFromEvent(payload.event, input.status),
    };
    const withAudit = addAudit(created, "Razorpay Webhook", "webhook_received", `Created from ${payload.event}`);
    localCases = [withAudit, ...localCases];
    return { created: true, case_id: withAudit.case_id };
  }

  const existing = await db.case.findUnique({ where: { disputeId: input.dispute_id } });
  if (existing) return { created: false, case_id: existing.caseId };

  const count = await db.case.count();
  const item = {
    ...buildCasePayload(input, count),
    packet_status: getPacketStatusFromEvent(payload.event, "draft"),
    status: getLifecycleStatusFromEvent(payload.event, input.status),
  };
  const merchant = merchantOverride || await getWebhookMerchant();

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

function buildLifecycleTimelineEvent(payload, input) {
  const event = payload.event || disputeStatusToWebhookEvent(input.status);
  const status = getLifecycleStatusFromEvent(event, input.status);
  const timestamp = payload.created_at ? new Date(Number(payload.created_at) * 1000) : new Date();
  const detail = event === "payment.dispute.action_required"
    ? `Razorpay requested more evidence for ${input.dispute_id}`
    : `Razorpay dispute ${input.dispute_id} moved to ${status}`;
  return {
    event,
    timestamp,
    status: event === "payment.dispute.lost" || event === "payment.dispute.action_required" ? "alert" : "ok",
    detail,
  };
}

function buildLifecycleAudit(payload, input) {
  const event = payload.event || disputeStatusToWebhookEvent(input.status);
  const status = getLifecycleStatusFromEvent(event, input.status);
  return {
    timestamp: new Date().toISOString(),
    actor: "Razorpay Webhook",
    action: event.replace("payment.dispute.", "dispute_"),
    detail: event === "payment.dispute.action_required"
      ? `Razorpay requires additional evidence before the dispute can continue.`
      : `Razorpay status updated to ${status} for ${input.dispute_id}.`,
  };
}

function lifecycleActionPatch(event, current = {}) {
  if (event === "payment.dispute.action_required") {
    return {
      recommended_action: "escalate",
      action_reason: "Razorpay needs additional evidence. Keep this in the action queue until the proof gap is resolved.",
    };
  }
  if (event === "payment.dispute.won") {
    return {
      recommended_action: current.recommended_action || "contest",
      action_reason: "Razorpay marked this dispute as won. The case can be closed with recovery recorded.",
    };
  }
  if (event === "payment.dispute.lost") {
    return {
      recommended_action: current.recommended_action || "accept",
      action_reason: "Razorpay marked this dispute as lost. Review amount deducted and close the case record.",
    };
  }
  return {};
}

async function upsertCaseFromRazorpayDispute(payload, merchantOverride = null) {
  const input = razorpayDisputeToCaseInput(payload);
  const event = payload.event || disputeStatusToWebhookEvent(input.status);
  const lifecycleStatus = getLifecycleStatusFromEvent(event, input.status);
  const nextPacketStatus = getPacketStatusFromEvent(event);
  const actionPatch = lifecycleActionPatch(event);
  const timelineEvent = buildLifecycleTimelineEvent(payload, input);
  const audit = buildLifecycleAudit(payload, input);
  const db = await getPrisma();

  if (!db) {
    const existing = localCases.find((item) => item.dispute_id === input.dispute_id);
    if (!existing) {
      const created = await createCaseFromRazorpayDispute(payload, merchantOverride);
      return { ...created, updated: false, lifecycle_status: lifecycleStatus };
    }

    localCases = localCases.map((caseItem) => {
      if (caseItem.dispute_id !== input.dispute_id) return caseItem;
      const hasEvent = (caseItem.timeline_events || []).some((item) => item.event === event);
      return {
        ...caseItem,
        payment_id: input.payment_id || caseItem.payment_id,
        order_id: input.order_id || caseItem.order_id,
        amount: input.amount || caseItem.amount,
        currency: input.currency || caseItem.currency,
        amount_deducted: input.amount_deducted ?? caseItem.amount_deducted,
        reason_code: input.reason_code || caseItem.reason_code,
        reason_description: cleanText(input.reason_description || caseItem.reason_description),
        dispute_reason: cleanText(input.dispute_reason || caseItem.dispute_reason),
        respond_by: input.respond_by || caseItem.respond_by,
        deadline: input.deadline || caseItem.deadline,
        status: lifecycleStatus,
        packet_status: nextPacketStatus || caseItem.packet_status,
        ...actionPatch,
        timeline_events: hasEvent ? caseItem.timeline_events : [...(caseItem.timeline_events || []), timelineEvent],
        audit_log: [...(caseItem.audit_log || []), audit],
      };
    });

    return { created: false, updated: true, case_id: existing.case_id, lifecycle_status: lifecycleStatus };
  }

  const merchant = merchantOverride || await getWebhookMerchant();
  const existing = await db.case.findFirst({
    where: { disputeId: input.dispute_id, merchantId: merchant.id },
    include: { evidenceItems: true, timelineEvents: true, auditLogs: true },
  });

  if (!existing) {
    const created = await createCaseFromRazorpayDispute(payload, merchant);
    return { ...created, updated: false, lifecycle_status: lifecycleStatus };
  }

  await db.case.update({
    where: { id: existing.id },
    data: {
      paymentId: input.payment_id || existing.paymentId,
      orderId: input.order_id || existing.orderId,
      customerName: input.customer_name || existing.customerName,
      customerEmail: input.customer_email || existing.customerEmail,
      amountPaise: Number(input.amount || Math.round(existing.amountPaise / 100)) * 100,
      currency: input.currency || existing.currency,
      paymentStatus: input.payment_status || existing.paymentStatus,
      disputeType: input.dispute_type,
      disputeReason: cleanText(input.dispute_reason || existing.disputeReason),
      deadline: new Date(input.deadline || existing.deadline),
      packetStatus: nextPacketStatus || existing.packetStatus,
      ...("recommended_action" in actionPatch ? { recommendedAction: actionPatch.recommended_action } : {}),
      ...("action_reason" in actionPatch ? { actionReason: actionPatch.action_reason } : {}),
    },
  });

  const hasTimelineEvent = existing.timelineEvents.some((item) => item.event === event);
  if (!hasTimelineEvent) {
    await db.timelineEvent.create({
      data: {
        caseId: existing.id,
        event: timelineEvent.event,
        timestamp: timelineEvent.timestamp,
        status: timelineEvent.status,
        detail: timelineEvent.detail,
      },
    });
  }

  await db.auditLog.create({
    data: {
      caseId: existing.id,
      timestamp: new Date(audit.timestamp),
      actor: audit.actor,
      action: audit.action,
      detail: audit.detail,
    },
  });

  return { created: false, updated: true, case_id: existing.caseId, lifecycle_status: lifecycleStatus };
}

function getRazorpayConfig() {
  return readRazorpayConfig();
}

async function callRazorpay(path) {
  return requestRazorpay(path);
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
    amount_deducted: Math.round(Number(dispute.amount_deducted || 0) / 100),
    currency: dispute.currency,
    status: dispute.status,
    phase: dispute.phase,
    reason_code: dispute.reason_code,
    reason_description: dispute.reason_description,
    respond_by: dispute.respond_by,
    created_at: dispute.created_at,
  };
}

async function buildRazorpayContestEvidence(caseRow, requestCaseId) {
  const evidence = {};
  const updates = [];
  for (const item of caseRow.evidenceItems || []) {
    if (item.status !== "available") continue;
    let documentId = item.razorpayDocumentId;
    if (!documentId) {
      if (!item.storageKey || !item.fileName || !item.mimeType) continue;
      const buffer = await readEvidenceUpload(requestCaseId, item.key, item.storageKey);
      if (!buffer) continue;
      const document = await uploadRazorpayDocument({ fileName: item.fileName, mimeType: item.mimeType, buffer });
      documentId = document.id;
      if (documentId) updates.push({ id: item.id, razorpayDocumentId: documentId });
    }
    if (!documentId) continue;
    const field = RAZORPAY_EVIDENCE_FIELDS[item.key];
    if (field) evidence[field] = [...new Set([...(evidence[field] || []), documentId])];
  }
  if (!Object.values(evidence).some((value) => value.length)) {
    const error = new Error("At least one uploaded evidence document is required before Razorpay submission");
    error.status = 422;
    throw error;
  }
  return { evidence, updates };
}

registerArchitectureRoutes(app);

app.set("getPrisma", getPrisma);
app.set("getCaseByParam", getCaseByParam);
app.set("toFrontendCase", toFrontendCase);
app.set("getLocalCases", () => localCases);
app.set("setLocalCases", (cases) => { localCases = cases; });
app.set("addAudit", addAudit);

app.use("/api/connectors", connectorRouter);

app.get("/api/webhooks/razorpay", (_req, res) => {
  res.status(405).json({
    error: "Method not allowed",
    message: "This webhook endpoint accepts signed POST requests from Razorpay.",
  });
});

app.get("/api/integrations/razorpay/status", (req, res) => {
  const config = getRazorpayConfig();
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const appOrigin = process.env.PUBLIC_APP_URL || (host ? `${protocol}://${host}` : "");
  res.json({
    configured: config.configured,
    mode: config.mode,
    key_id: config.maskedKeyId,
    webhook_secret_configured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
    webhook_url: appOrigin ? `${appOrigin}/api/webhooks/razorpay` : "/api/webhooks/razorpay",
    required_event: "payment.dispute.created",
    required_events: [
      "payment.dispute.created",
      "payment.dispute.under_review",
      "payment.dispute.action_required",
      "payment.dispute.won",
      "payment.dispute.lost",
      "payment.dispute.closed",
    ],
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

app.post("/api/integrations/razorpay/sync-disputes", rateLimit({ max: 10 }), async (req, res, next) => {
  try {
    const count = Math.min(Number(req.body?.count || req.query.count || 10), 50);
    const data = await callRazorpay(`/disputes?count=${count}`);
    const disputes = Array.isArray(data.items) ? data.items : [];
    const results = [];

    for (const dispute of disputes) {
      try {
        let payment = null;
        if (dispute.payment_id) {
          payment = await callRazorpay(`/payments/${encodeURIComponent(dispute.payment_id)}`).catch(() => null);
        }

        const lifecycleEvent = disputeStatusToWebhookEvent(dispute.status);
        const payload = {
          event: lifecycleEvent,
          created_at: dispute.created_at || Math.floor(Date.now() / 1000),
          payload: {
            dispute: { entity: dispute },
            payment: { entity: payment || { id: dispute.payment_id, amount: dispute.amount, currency: dispute.currency, status: "captured" } },
          },
        };

        const synced = await upsertCaseFromRazorpayDispute(payload, req.merchant);
        results.push({ dispute_id: dispute.id, payment_id: dispute.payment_id || null, event: lifecycleEvent, ...synced });
      } catch (error) {
        results.push({ dispute_id: dispute.id || null, created: false, error: error.message });
      }
    }

    res.json({
      ok: true,
      provider: "razorpay",
      fetched: disputes.length,
      created: results.filter((item) => item.created).length,
      updated: results.filter((item) => item.updated).length,
      existing: results.filter((item) => item.created === false && !item.updated && !item.error).length,
      failed: results.filter((item) => item.error).length,
      results,
      synced_at: new Date().toISOString(),
    });
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

app.post("/api/ai/judgment/validate", (req, res) => {
  const parsed = safeParseAiJson(req.body?.raw_output ?? req.body);
  if (!parsed.ok) {
    return res.json(buildFallbackAiJudgment({}, parsed.reason));
  }
  res.json({
    ok: true,
    judgment: validateAiCaseJudgment(parsed.value),
    boundary: "AI output is advisory only; final decisions require rules and human approval.",
  });
});

app.post("/api/ai/judgment/analyze", (req, res) => {
  const caseItem = req.body && typeof req.body === "object" ? req.body : {};
  res.json({
    ok: true,
    judgment: buildAiJudgment(caseItem),
    boundary: "AI classifies complaint text, extracts useful signals, and drafts response text only.",
  });
});

async function loadFrontendCases(merchantId) {
  const db = await getPrisma();
  if (!db) return attachWorkflow(localCases);
  const rows = await db.case.findMany({
    where: { merchantId },
    orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }],
    include: { evidenceItems: true, timelineEvents: true, auditLogs: true },
  });
  return rows.map(toFrontendCase);
}

app.get("/api/metrics", async (req, res, next) => {
  try {
    res.json(buildMetricsResponse(await loadFrontendCases(req.merchant?.id)));
  } catch (error) {
    next(error);
  }
});

app.get("/api/evaluation", async (req, res, next) => {
  try {
    res.json(buildEvaluationResponse(await loadFrontendCases(req.merchant?.id)));
  } catch (error) {
    next(error);
  }
});

app.get("/api/reliability", async (req, res, next) => {
  try {
    const cases = await loadFrontendCases(req.merchant?.id);
    const config = getRazorpayConfig();
    const blockedContestCases = cases.filter((item) => item.recommended_action === "contest" && item.readiness_score < 80);
    const humanApprovedCases = cases.filter((item) => ["approved", "accepted", "escalated", "contested", "closed"].includes(item.packet_status));
    const auditedHumanDecisions = humanApprovedCases.filter((item) => (item.audit_log || []).some((log) => log.actor === "Human Reviewer"));
    const uploadedEvidenceCount = cases.reduce((count, item) => count + Object.keys(item.evidence_files || {}).length, 0);

    // State machine distribution
    const stateDistribution = cases.reduce((acc, item) => {
      const state = item.workflow_state || "UNKNOWN";
      acc[state] = (acc[state] || 0) + 1;
      return acc;
    }, {});

    // Queue health
    const queueHealth = await getQueueHealth();

    // Connector status
    const connectors = getConnectorStatus();
    const activeConnectors = connectors.filter((c) => c.configured);

    const checks = [
      {
        key: "webhook_signature",
        label: "Webhook signature gate",
        status: process.env.RAZORPAY_WEBHOOK_SECRET ? "passing" : "needs_config",
        proof: "Only verified Razorpay events are accepted before case creation.",
      },
      {
        key: "webhook_idempotency",
        label: "Duplicate webhook protection",
        status: "passing",
        proof: "Webhook fingerprints are stored so repeated deliveries are acknowledged without creating duplicate cases.",
      },
      {
        key: "state_machine",
        label: "Case lifecycle controls",
        status: "passing",
        proof: `${cases.length} case(s) currently follow the controlled dispute workflow.`,
      },
      {
        key: "missing_evidence_block",
        label: "Missing evidence approval block",
        status: "passing",
        proof: `${blockedContestCases.length} contest candidate(s) blocked until required proof reaches the readiness threshold.`,
      },
      {
        key: "human_approval",
        label: "Human approval before action",
        status: auditedHumanDecisions.length === humanApprovedCases.length ? "passing" : "needs_review",
        proof: `${auditedHumanDecisions.length}/${humanApprovedCases.length} decided case(s) include reviewer audit entries.`,
      },
      {
        key: "ai_fallback",
        label: "AI response fallback",
        status: "passing",
        proof: "Classification issues fall back to a reviewer-controlled draft.",
      },
      {
        key: "evidence_storage",
        label: "Evidence file persistence",
        status: process.env.EVIDENCE_STORAGE_PROVIDER === "s3" || process.env.EVIDENCE_S3_BUCKET ? "passing" : "local_storage",
        proof: `${uploadedEvidenceCount} evidence file(s) linked. Configured deployments use cloud evidence storage.`,
      },
      {
        key: "job_queue",
        label: "Background job retry queue",
        status: queueHealth.available ? "passing" : "needs_config",
        proof: queueHealth.available
          ? "Persistent background retries are active."
          : "Persistent background retries are not enabled for this environment.",
      },
      {
        key: "evidence_connectors",
        label: "Evidence auto-collection connectors",
        status: activeConnectors.length > 0 ? "passing" : "needs_config",
        proof: `${activeConnectors.length}/${connectors.length} connectors active: ${activeConnectors.map((c) => c.name).join(", ") || "none configured"}.`,
      },
      {
        key: "external_submission",
        label: "Dispute submission control",
        status: "passing",
        proof: "Razorpay dispute actions require an approved evidence packet and a reviewer audit trail.",
      },
    ];

    res.json({
      ok: true,
      source: "backend",
      checks,
      integrations: {
        case_store: useDatabase ? "Connected database" : "Local fallback",
        razorpay: config.configured ? "Connected" : "Not connected",
        webhook_secret: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
        evidence_storage: process.env.EVIDENCE_STORAGE_PROVIDER === "s3" || process.env.EVIDENCE_S3_BUCKET ? "Cloud storage" : "Local storage",
        job_queue: queueHealth.available ? "Persistent retries" : "Synchronous processing",
        connectors: `${activeConnectors.length}/${connectors.length} active`,
        demo_mode: process.env.DEMO_MODE === "true",
      },
      state_distribution: stateDistribution,
      queue: queueHealth,
      connector_status: connectors,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/cases", async (req, res, next) => {
  try {
    const db = await getPrisma();
    if (!db) return res.json(attachWorkflow(localCases));
    let rows = await db.case.findMany({
      where: req.merchant ? { merchantId: req.merchant.id } : {},
      orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }],
      include: { evidenceItems: true, timelineEvents: true, auditLogs: true },
    });
    if ((!rows || rows.length === 0) && process.env.DEMO_MODE === "true") {
      rows = await db.case.findMany({
        orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }],
        include: { evidenceItems: true, timelineEvents: true, auditLogs: true },
      });
    }
    res.json(rows.map(toFrontendCase));
  } catch (error) {
    next(error);
  }
});

app.get("/api/cases/:id", async (req, res, next) => {
  try {
    const db = await getPrisma();
    if (!db) {
      const found = localCases.find((item) => item.id === req.params.id || item.case_id === req.params.id);
      if (!found) return res.status(404).json({ error: "Case not found" });
      return res.json(found);
    }
    const row = await getCaseByParam(db, req.params.id, req.merchant?.id);
    if (!row) return res.status(404).json({ error: "Case not found" });
    res.json(toFrontendCase(row));
  } catch (error) {
    next(error);
  }
});

app.post("/api/cases/bulk-action", async (req, res, next) => {
  try {
    const { caseIds, action, payload } = validateBulkActionBody(req.body);
    const detail = bulkAuditDetail(action, payload);
    const db = await getPrisma();

    if (!db) {
      const selectedCases = localCases.filter((caseItem) => caseIds.includes(caseItem.id) || caseIds.includes(caseItem.case_id));
      if (selectedCases.length !== caseIds.length) {
        return res.status(404).json({ error: "One or more cases were not found" });
      }
      if (action === "approve") {
        selectedCases.forEach((caseItem) => ensureContestHasEvidence(caseItem, "approved"));
      }
      const patch = bulkCasePatch(action, payload);
      localCases = localCases.map((caseItem) => {
        if (!caseIds.includes(caseItem.id) && !caseIds.includes(caseItem.case_id)) return caseItem;
        return addAudit({ ...caseItem, ...patch }, "Human Reviewer", `bulk_${action}`, detail);
      });
      const updatedCases = attachWorkflow(localCases.filter((caseItem) => caseIds.includes(caseItem.id) || caseIds.includes(caseItem.case_id)));
      return res.json({ ok: true, action, updated: updatedCases.length, cases: updatedCases });
    }

    const updatedRows = await db.$transaction(async (tx) => {
      const rows = await tx.case.findMany({
        where: {
          merchantId: req.merchant.id,
          OR: [{ id: { in: caseIds } }, { caseId: { in: caseIds } }],
        },
        include: { evidenceItems: true, timelineEvents: true, auditLogs: true },
      });
      if (rows.length !== caseIds.length) {
        const error = new Error("One or more cases were not found");
        error.status = 404;
        throw error;
      }
      if (action === "approve") {
        rows.forEach((row) => ensureContestHasEvidence(toFrontendCase(row), "approved"));
      }

      const dbPatch = bulkCaseDbPatch(action, payload);
      await Promise.all(rows.map((row) => tx.case.update({ where: { id: row.id }, data: dbPatch })));
      await tx.auditLog.createMany({
        data: rows.map((row) => ({
          caseId: row.id,
          actor: "Human Reviewer",
          action: `bulk_${action}`,
          detail,
        })),
      });
      return tx.case.findMany({
        where: { id: { in: rows.map((row) => row.id) } },
        include: { evidenceItems: true, timelineEvents: true, auditLogs: true },
      });
    });

    res.json({ ok: true, action, updated: updatedRows.length, cases: updatedRows.map(toFrontendCase) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/cases/:id/export-pdf", async (req, res, next) => {
  try {
    const db = await getPrisma();
    let caseItem;
    let merchant = req.merchant;

    if (!db) {
      caseItem = attachWorkflow(localCases).find((item) => item.id === req.params.id || item.case_id === req.params.id);
      if (!caseItem) return res.status(404).json({ error: "Case not found" });
      localCases = localCases.map((item) => {
        if (item.id !== req.params.id && item.case_id !== req.params.id) return item;
        return addAudit(item, "ProofPilot Export", "pdf_exported", `Exported PDF dispute packet for ${item.order_id}`);
      });
    } else {
      const row = await getCaseByParam(db, req.params.id, req.merchant.id);
      if (!row) return res.status(404).json({ error: "Case not found" });
      caseItem = toFrontendCase(row);
      merchant = req.merchant;
      await db.auditLog.create({
        data: {
          caseId: row.id,
          actor: "ProofPilot Export",
          action: "pdf_exported",
          detail: `Exported PDF dispute packet for ${row.orderId}`,
        },
      });
    }

    const pdfBuffer = buildDisputePacketPdf(caseItem, { merchant });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${caseItem.case_id}-dispute-packet.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.status(200).end(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

app.get("/api/cases/:id/evidence-files/:evidenceKey", async (req, res, next) => {
  try {
    const db = await getPrisma();
    const caseRow = db ? await getCaseByParam(db, req.params.id, req.merchant?.id) : null;
    const localCase = db ? null : localCases.find((item) => item.id === req.params.id || item.case_id === req.params.id);
    const evidenceRow = caseRow?.evidenceItems?.find((item) => item.key === req.params.evidenceKey);
    const localEvidenceFile = localCase?.evidence_files?.[req.params.evidenceKey];
    const upload = await findEvidenceUpload(
      req.params.id,
      req.params.evidenceKey,
      evidenceRow?.storageKey || localEvidenceFile?.storage_key,
      evidenceRow?.fileName || localEvidenceFile?.file_name,
    );
    if (!upload) return res.status(404).json({ error: "Evidence file not found" });
    if (upload.storage_provider === "s3") {
      res.setHeader("Content-Type", evidenceRow?.mimeType || "application/octet-stream");
      return upload.body.pipe(res);
    }
    res.download(upload.absolutePath, upload.file_name);
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

    const created = await db.case.create({
      data: {
        caseId: item.case_id,
        merchantId: req.merchant.id,
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
    const { evidenceKey, fileName, mimeType, size, contentBase64 } = req.body;
    if (typeof evidenceKey !== "string" || !evidenceKey.trim()) {
      return res.status(400).json({ error: "A valid evidenceKey is required" });
    }
    if (fileName !== undefined && typeof fileName !== "string") {
      return res.status(400).json({ error: "fileName must be a string" });
    }
    let upload = null;
    if (contentBase64) {
      upload = await saveEvidenceUpload({
        caseId: req.params.id,
        evidenceKey,
        fileName,
        mimeType,
        size,
        contentBase64,
      });
    }
    const db = await getPrisma();
    if (!db) {
      localCases = localCases.map((caseItem) => {
        if (caseItem.id !== req.params.id && caseItem.case_id !== req.params.id) return caseItem;
        const available = [...new Set([...(caseItem.available_evidence || []), evidenceKey])];
        const missing = (caseItem.missing_evidence || []).filter((item) => item !== evidenceKey);
        const updated = {
          ...caseItem,
          available_evidence: available,
          missing_evidence: missing,
          evidence_files: {
            ...(caseItem.evidence_files || {}),
            ...(upload ? { [evidenceKey]: upload } : {}),
          },
        };
        const scores = scoreCase(updated);
        return addAudit(
          { ...updated, ...scores },
          "Evidence Radar",
          "evidence_attached",
          `Attached ${evidenceKey}${upload?.file_name || fileName ? ` (${upload?.file_name || fileName})` : ""}`,
        );
      });
      return res.json(localCases.find((item) => item.id === req.params.id || item.case_id === req.params.id));
    }

    const caseRow = await getCaseByParam(db, req.params.id, req.merchant.id);
    if (!caseRow) return res.status(404).json({ error: "Case not found" });
    await db.evidenceItem.upsert({
      where: { caseId_key: { caseId: caseRow.id, key: evidenceKey } },
      update: {
        status: "available",
        fileName: upload?.file_name || fileName || evidenceKey,
        mimeType: upload?.mime_type || mimeType,
        sizeBytes: upload?.size_bytes || size,
        storageProvider: upload?.storage_provider,
        storageKey: upload?.storage_key,
        attachedAt: new Date(),
      },
      create: {
        caseId: caseRow.id,
        key: evidenceKey,
        label: evidenceKey,
        status: "available",
        fileName: upload?.file_name || fileName || evidenceKey,
        mimeType: upload?.mime_type || mimeType,
        sizeBytes: upload?.size_bytes || size,
        storageProvider: upload?.storage_provider,
        storageKey: upload?.storage_key,
        attachedAt: new Date(),
      },
    });

    const refreshed = await getCaseByParam(db, req.params.id, req.merchant.id);
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
    await db.auditLog.create({ data: { caseId: refreshed.id, actor: "Evidence Radar", action: "evidence_attached", detail: `Attached ${evidenceKey}${upload?.file_name ? ` (${upload.file_name})` : ""}` } });
    const finalRow = await getCaseByParam(db, req.params.id, req.merchant.id);
    res.json(toFrontendCase(finalRow));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/cases/:id/evidence/:evidenceKey", async (req, res, next) => {
  try {
    const evidenceKey = req.params.evidenceKey;
    const db = await getPrisma();
    if (!db) {
      localCases = localCases.map((caseItem) => {
        if (caseItem.id !== req.params.id && caseItem.case_id !== req.params.id) return caseItem;
        const available = (caseItem.available_evidence || []).filter((item) => item !== evidenceKey);
        const required = getRequired(caseItem.dispute_type);
        const missing = required.includes(evidenceKey)
          ? [...new Set([...(caseItem.missing_evidence || []), evidenceKey])]
          : caseItem.missing_evidence || [];
        const evidenceFiles = { ...(caseItem.evidence_files || {}) };
        delete evidenceFiles[evidenceKey];
        const updated = {
          ...caseItem,
          available_evidence: available,
          missing_evidence: missing,
          evidence_files: evidenceFiles,
        };
        const scores = scoreCase(updated);
        return addAudit(
          { ...updated, ...scores },
          "Evidence Radar",
          "evidence_removed",
          `Removed ${evidenceKey}`,
        );
      });
      return res.json(localCases.find((item) => item.id === req.params.id || item.case_id === req.params.id));
    }

    const caseRow = await getCaseByParam(db, req.params.id, req.merchant.id);
    if (!caseRow) return res.status(404).json({ error: "Case not found" });
    const evidenceRow = caseRow.evidenceItems?.find((item) => item.key === evidenceKey);
    if (evidenceRow?.storageKey) {
      await deleteEvidenceUpload(caseRow.caseId, evidenceKey, evidenceRow.storageKey).catch(() => {});
    }

    await db.evidenceItem.upsert({
      where: { caseId_key: { caseId: caseRow.id, key: evidenceKey } },
      update: {
        status: "missing",
        fileName: null,
        mimeType: null,
        sizeBytes: null,
        storageProvider: null,
        storageKey: null,
        razorpayDocumentId: null,
        attachedAt: null,
      },
      create: {
        caseId: caseRow.id,
        key: evidenceKey,
        label: EVIDENCE_LABELS[evidenceKey] || evidenceKey,
        status: "missing",
      },
    });

    const refreshed = await getCaseByParam(db, req.params.id, req.merchant.id);
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
    await db.auditLog.create({ data: { caseId: refreshed.id, actor: "Evidence Radar", action: "evidence_removed", detail: `Removed ${evidenceKey}` } });
    const finalRow = await getCaseByParam(db, req.params.id, req.merchant.id);
    res.json(toFrontendCase(finalRow));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/cases/:id/draft", async (req, res, next) => {
  try {
    const { draft } = req.body;
    if (typeof draft !== "string" || !draft.trim()) {
      return res.status(400).json({ error: "A non-empty response draft is required" });
    }
    if (draft.length > 10000) {
      return res.status(400).json({ error: "Response draft must be 10,000 characters or fewer" });
    }
    const db = await getPrisma();
    if (!db) {
      localCases = localCases.map((caseItem) => {
        if (caseItem.id !== req.params.id && caseItem.case_id !== req.params.id) return caseItem;
        return addAudit({ ...caseItem, merchant_response_draft: draft }, "Human Reviewer", "edited", "Merchant response draft edited by human");
      });
      return res.json(localCases.find((item) => item.id === req.params.id || item.case_id === req.params.id));
    }

    const caseRow = await getCaseByParam(db, req.params.id, req.merchant.id);
    if (!caseRow) return res.status(404).json({ error: "Case not found" });
    await db.case.update({ where: { id: caseRow.id }, data: { merchantResponseDraft: draft } });
    await db.auditLog.create({ data: { caseId: caseRow.id, actor: "Human Reviewer", action: "edited", detail: "Merchant response draft edited by human" } });
    const finalRow = await getCaseByParam(db, req.params.id, req.merchant.id);
    res.json(toFrontendCase(finalRow));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/cases/:id/decision", async (req, res, next) => {
  try {
    const { status } = req.body;
    validateDecisionStatus(status);
    const reason = cleanText(String(req.body?.reason || "").trim()).slice(0, 1000);
    const db = await getPrisma();
    if (!db) {
      const current = localCases.find((caseItem) => caseItem.id === req.params.id || caseItem.case_id === req.params.id);
      if (!current) return res.status(404).json({ error: "Case not found" });
      ensureContestHasEvidence(current, status);
      if (!reason) return res.status(400).json({ error: "Reviewer reason is required before recording a final decision" });
      localCases = localCases.map((caseItem) => {
        if (caseItem.id !== req.params.id && caseItem.case_id !== req.params.id) return caseItem;
        return addAudit({ ...caseItem, packet_status: status }, "Human Reviewer", status, `Packet ${status}: ${reason}`);
      });
      return res.json(localCases.find((item) => item.id === req.params.id || item.case_id === req.params.id));
    }

    const caseRow = await getCaseByParam(db, req.params.id, req.merchant.id);
    if (!caseRow) return res.status(404).json({ error: "Case not found" });
    ensureContestHasEvidence(toFrontendCase(caseRow), status);
    if (!reason) return res.status(400).json({ error: "Reviewer reason is required before recording a final decision" });
    await db.case.update({ where: { id: caseRow.id }, data: { packetStatus: status } });
    await db.auditLog.create({ data: { caseId: caseRow.id, actor: "Human Reviewer", action: status, detail: `Packet ${status}: ${reason}` } });
    const finalRow = await getCaseByParam(db, req.params.id, req.merchant.id);
    res.json(toFrontendCase(finalRow));
  } catch (error) {
    next(error);
  }
});

app.post("/api/cases/:id/submit", async (req, res, next) => {
  try {
    const db = await getPrisma();
    let caseItem;
    let caseRow = null;
    if (db) {
      caseRow = await getCaseByParam(db, req.params.id, req.merchant.id);
      if (!caseRow) return res.status(404).json({ error: "Case not found" });
      caseItem = toFrontendCase(caseRow);
    } else {
      caseItem = localCases.find((item) => item.id === req.params.id || item.case_id === req.params.id);
      if (!caseItem) return res.status(404).json({ error: "Case not found" });
    }

    ensureReadinessThreshold(caseItem);

    if (!db) return res.status(503).json({ error: "Razorpay submission requires PostgreSQL mode" });
    if (caseRow.packetStatus !== "approved") {
      return res.status(409).json({ error: "A packet must be approved before external submission" });
    }

    const action = req.body?.action || "contest";
    let response;
    if (action === "accept") {
      response = await acceptRazorpayDispute(caseRow.disputeId);
    } else if (action === "contest") {
      const { evidence, updates } = await buildRazorpayContestEvidence(caseRow, req.params.id);
      response = await contestRazorpayDispute(caseRow.disputeId, {
        amount: caseRow.amountPaise,
        summary: caseRow.merchantResponseDraft.slice(0, 1000),
        ...evidence,
      });
      for (const update of updates) {
        await db.evidenceItem.update({ where: { id: update.id }, data: { razorpayDocumentId: update.razorpayDocumentId } });
      }
    } else {
      return res.status(400).json({ error: "Submission action must be contest or accept" });
    }

    await db.case.update({ where: { id: caseRow.id }, data: { packetStatus: action === "accept" ? "accepted" : "approved" } });
    await db.auditLog.create({ data: { caseId: caseRow.id, actor: "Razorpay API", action: `dispute_${action}_submitted`, detail: `Submitted ${caseRow.disputeId} to Razorpay` } });
    res.json({ ok: true, action, razorpay: response, case: toFrontendCase(await getCaseByParam(db, req.params.id, req.merchant.id)) });
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

    const caseRow = await getCaseByParam(db, req.params.id, req.merchant.id);
    if (!caseRow) return res.status(404).json({ error: "Case not found" });
    await db.auditLog.create({
      data: {
        caseId: caseRow.id,
        actor: "ProofPilot Export",
        action: "packet_exported",
        detail: `Exported dispute packet for ${caseRow.orderId}`,
      },
    });
    const finalRow = await getCaseByParam(db, req.params.id, req.merchant.id);
    res.json(toFrontendCase(finalRow));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/cases/:id", async (req, res, next) => {
  try {
    const db = await getPrisma();
    if (!db) {
      const caseItem = localCases.find((item) => item.id === req.params.id || item.case_id === req.params.id);
      if (!caseItem) return res.status(404).json({ error: "Case not found" });
      if (!isManualCase(caseItem)) {
        return res.status(403).json({ error: "Only manually added test cases can be deleted" });
      }
      localCases = localCases.filter((item) => item.id !== caseItem.id && item.case_id !== caseItem.case_id);
      return res.json({ deleted: true, id: caseItem.id, case_id: caseItem.case_id });
    }

    const caseRow = await getCaseByParam(db, req.params.id, req.merchant.id);
    if (!caseRow) return res.status(404).json({ error: "Case not found" });
    if (!isManualCase(caseRow)) {
      return res.status(403).json({ error: "Only manually added test cases can be deleted" });
    }

    await db.case.delete({ where: { id: caseRow.id } });
    res.json({ deleted: true, id: caseRow.caseId, case_id: caseRow.caseId });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me — current authenticated merchant info
app.get("/api/auth/me", async (req, res) => {
  const db = await getPrisma();
  res.json({
    ok: true,
    auth: req.auth,
    merchant: req.merchant
      ? {
          id: req.merchant.id,
          name: req.merchant.name,
          email: req.merchant.email,
          razorpay_configured: Boolean(process.env.RAZORPAY_KEY_ID),
        }
      : null,
    mode: useDatabase ? "postgres" : "local",
    demo_mode: process.env.DEMO_MODE === "true",
  });
});

// POST /api/cases/:id/auto-collect-evidence — run all configured connectors
app.post("/api/cases/:id/auto-collect-evidence", rateLimit({ max: 20 }), async (req, res, next) => {
  try {
    const db = await getPrisma();
    let caseItem;
    if (db) {
      const row = await getCaseByParam(db, req.params.id, req.merchant?.id);
      if (!row) return res.status(404).json({ error: "Case not found" });
      caseItem = toFrontendCase(row);
    } else {
      caseItem = localCases.find((item) => item.id === req.params.id || item.case_id === req.params.id);
      if (!caseItem) return res.status(404).json({ error: "Case not found" });
    }

    const result = await autoCollectEvidence(caseItem);
    const autoItems = (result.all_evidence || []).filter((item) => item.auto_available && item.evidence_key);
    const persistOne = db
      ? async (item) => {
          const row = await getCaseByParam(db, req.params.id, req.merchant?.id);
          const attachedAt = new Date();
          await db.evidenceItem.upsert({
            where: { caseId_key: { caseId: row.id, key: item.evidence_key } },
            update: { status: "available", attachedAt },
            create: {
              caseId: row.id,
              key: item.evidence_key,
              label: EVIDENCE_LABELS[item.evidence_key] || item.evidence_key,
              status: "available",
              attachedAt,
            },
          });
          return { attached_at: attachedAt.toISOString(), source: item.source || "connector" };
        }
      : async (item) => ({ attached_at: new Date().toISOString(), source: item.source || "connector" });

    const { persisted, failed } = await persistConnectorEvidence({
      items: autoItems,
      persistOne,
    });
    result.persisted_evidence = persisted.map((item) => item.evidence_key);
    result.persist_failures = failed;

    if (persisted.length && db) {
      const row = await getCaseByParam(db, req.params.id, req.merchant?.id);
      const mapped = toFrontendCase(row);
      const scores = scoreCase(mapped);
      await db.case.update({
        where: { id: row.id },
        data: {
          riskScore: scores.risk_score,
          readinessScore: scores.readiness_score,
          confidenceScore: scores.confidence_score,
          recommendedAction: scores.recommended_action,
          actionReason: scores.action_reason,
        },
      });
      await db.auditLog.create({
        data: {
          caseId: row.id,
          actor: "Evidence Connector",
          action: "auto_collected",
          detail: `Persisted connector evidence: ${persisted.map((item) => item.evidence_key).join(", ")}.`,
        },
      });
    } else if (persisted.length && !db) {
      localCases = localCases.map((item) => {
        if (item.id !== req.params.id && item.case_id !== req.params.id) return item;
        const updated = applyPersistedEvidenceToCase(item, persisted);
        const scores = scoreCase(updated);
        return addAudit(
          { ...updated, ...scores },
          "Evidence Connector",
          "auto_collected",
          `Persisted connector evidence: ${persisted.map((entry) => entry.evidence_key).join(", ")}`,
        );
      });
    }

    res.json({ ok: true, case_id: req.params.id, collection: result });
  } catch (error) {
    next(error);
  }
});

// GET /api/reliability/export — machine-readable export for judges/evaluators
app.get("/api/reliability/export", async (req, res, next) => {
  try {
    const cases = await loadFrontendCases(req.merchant?.id);
    const queueHealth = await getQueueHealth();
    const connectors = getConnectorStatus();
    const evaluation = buildEvaluationResponse(cases);
    const stateDistribution = cases.reduce((acc, item) => {
      const state = item.workflow_state || "UNKNOWN";
      acc[state] = (acc[state] || 0) + 1;
      return acc;
    }, {});

    res.json({
      ok: true,
      exported_at: new Date().toISOString(),
      product: "ProofPilot AI",
      version: "1.0.0",
      pitch: "Production-style AI Risk Manager workflow for dispute readiness: signed Razorpay webhooks, deterministic risk rules, evidence upload, backend metrics, AI-safe drafting, human approval, formal state machine, background job queue, and reliability tests.",
      architecture: evaluation.architecture,
      model: evaluation.model,
      live_metrics: evaluation.live_metrics,
      workflow_states: stateDistribution,
      production_gaps_remaining: [
        "Replace synthetic ML training data with real Razorpay historical dispute outcomes",
        "Complete Shiprocket and email connector implementations (stubs ready)",
        "Configure S3 bucket for cloud evidence storage (code ready, env vars needed)",
        "Configure REDIS_URL for production job retry queue (BullMQ ready, falls back gracefully)",
        "Prove Razorpay dispute submission against live API credentials and real dispute IDs",
      ],
      infrastructure: {
        database: useDatabase ? "PostgreSQL (Prisma)" : "Local in-memory (demo)",
        queue: queueHealth,
        connectors,
        demo_mode: process.env.DEMO_MODE === "true",
      },
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.use(express.static(distDir));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  const malformedJson = error instanceof SyntaxError && error.status === 400 && "body" in error;
  const status = malformedJson ? 400 : Number(error.status || 500);
  if (status >= 500) console.error(error);
  const failureState = error.failureState
    || (malformedJson ? FAILURE_STATES.PAYLOAD_INCOMPLETE : status >= 500 ? FAILURE_STATES.DB_WRITE_FAILED : FAILURE_STATES.NEEDS_MANUAL_REVIEW);
  const payload = {
    error: malformedJson ? "Invalid JSON request body" : error.message || "ProofPilot API error",
    failure_state: failureState,
  };
  if (status >= 500 && process.env.NODE_ENV !== "production") payload.detail = error.message;
  res.status(status).json(payload);
});

if (process.env.NODE_ENV === "production") {
  const requiredProductionConfig = [
    ["USE_DATABASE", useDatabase],
    ["AUTH_JWKS_URL", process.env.AUTH_JWKS_URL],
    ["AUTH_ISSUER", process.env.AUTH_ISSUER],
    ["AUTH_AUDIENCE", process.env.AUTH_AUDIENCE],
    ["EVIDENCE_S3_BUCKET", process.env.EVIDENCE_S3_BUCKET],
    ["AWS_REGION", process.env.AWS_REGION],
    ["RAZORPAY_KEY_ID", process.env.RAZORPAY_KEY_ID],
    ["RAZORPAY_KEY_SECRET", process.env.RAZORPAY_KEY_SECRET],
    ["RAZORPAY_WEBHOOK_SECRET", process.env.RAZORPAY_WEBHOOK_SECRET],
    ["RAZORPAY_MERCHANT_AUTH_SUBJECT", process.env.RAZORPAY_MERCHANT_AUTH_SUBJECT],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (requiredProductionConfig.length) {
    throw new Error(`Missing production configuration: ${requiredProductionConfig.join(", ")}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Start background job workers (no-ops if Redis not configured)
  startWorkers().catch((error) => console.warn("[Workers] Failed to start:", error.message));

  app.listen(port, () => {
    console.log(`ProofPilot API ready on http://localhost:${port}`);
  });
}
