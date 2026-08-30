import { EVIDENCE_LABELS, getRequired, scoreCase } from "../../src/lib/ruleEngine.js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "evidence");
const storageProvider = process.env.EVIDENCE_STORAGE_PROVIDER || (process.env.NODE_ENV === "production" ? "s3" : "local");
const s3Bucket = process.env.EVIDENCE_S3_BUCKET;
const s3Client = storageProvider === "s3" ? new S3Client({
  region: process.env.AWS_REGION,
  ...(process.env.AWS_ENDPOINT_URL ? { endpoint: process.env.AWS_ENDPOINT_URL } : {}),
  forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === "true",
}) : null;

export function buildEvidenceChecklist(caseItem) {
  const required = getRequired(caseItem.dispute_type);
  const available = new Set(caseItem.available_evidence || []);
  return required.map((key) => ({
    key,
    label: EVIDENCE_LABELS[key] || key,
    status: available.has(key) ? "available" : "missing",
  }));
}

export function applyEvidence(caseItem, evidenceKey) {
  const available = [...new Set([...(caseItem.available_evidence || []), evidenceKey])];
  const missing = (caseItem.missing_evidence || []).filter((key) => key !== evidenceKey);
  return {
    ...caseItem,
    available_evidence: available,
    missing_evidence: missing,
    ...scoreCase({ ...caseItem, available_evidence: available, missing_evidence: missing }),
  };
}

function safeSegment(value) {
  return String(value || "unknown")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "unknown";
}

function decodeBase64(contentBase64) {
  if (typeof contentBase64 !== "string" || !contentBase64.trim()) return null;
  const cleaned = contentBase64.includes(",") ? contentBase64.split(",").pop() : contentBase64;
  return Buffer.from(cleaned, "base64");
}

export function validateEvidenceUpload({ fileName, mimeType, size, contentBase64 }) {
  if (!fileName || typeof fileName !== "string") {
    const error = new Error("Evidence upload requires a file name");
    error.status = 400;
    throw error;
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    const error = new Error("Unsupported evidence file type");
    error.status = 415;
    throw error;
  }
  if (Number(size || 0) > MAX_UPLOAD_BYTES) {
    const error = new Error("Evidence file must be 5 MB or smaller");
    error.status = 413;
    throw error;
  }
  const fileBuffer = decodeBase64(contentBase64);
  if (!fileBuffer?.length) {
    const error = new Error("Evidence upload body is empty");
    error.status = 400;
    throw error;
  }
  if (fileBuffer.length > MAX_UPLOAD_BYTES) {
    const error = new Error("Evidence file must be 5 MB or smaller");
    error.status = 413;
    throw error;
  }
  return fileBuffer;
}

export async function saveEvidenceUpload({ caseId, evidenceKey, fileName, mimeType, size, contentBase64 }) {
  const fileBuffer = validateEvidenceUpload({ fileName, mimeType, size, contentBase64 });
  if (storageProvider === "s3" && (!s3Bucket || !process.env.AWS_REGION)) {
    const error = new Error("S3 evidence storage is not configured");
    error.status = 503;
    throw error;
  }
  const uploadId = crypto.randomUUID();
  const safeCaseId = safeSegment(caseId);
  const safeEvidenceKey = safeSegment(evidenceKey);
  const safeFileName = safeSegment(fileName);
  const storageKey = `evidence/${safeCaseId}/${safeEvidenceKey}-${uploadId}-${safeFileName}`;
  if (storageProvider === "s3") {
    await s3Client.send(new PutObjectCommand({ Bucket: s3Bucket, Key: storageKey, Body: fileBuffer, ContentType: mimeType }));
  } else {
    const caseDir = path.join(UPLOAD_ROOT, safeCaseId);
    await fs.mkdir(caseDir, { recursive: true });
    await fs.writeFile(path.join(caseDir, path.basename(storageKey)), fileBuffer);
  }

  return {
    upload_id: uploadId,
    file_name: fileName,
    mime_type: mimeType,
    size_bytes: fileBuffer.length,
    uploaded_at: new Date().toISOString(),
    storage_provider: storageProvider,
    storage_key: storageKey,
    download_url: `/api/cases/${encodeURIComponent(caseId)}/evidence-files/${encodeURIComponent(evidenceKey)}`,
  };
}

export async function findEvidenceUpload(caseId, evidenceKey, storedKey, preferredFileName) {
  if (storageProvider === "s3" && storedKey) {
    const response = await s3Client.send(new GetObjectCommand({ Bucket: s3Bucket, Key: storedKey }));
    return {
      body: response.Body,
      file_name: preferredFileName || path.basename(storedKey),
      size_bytes: response.ContentLength,
      uploaded_at: response.LastModified?.toISOString?.(),
      storage_provider: "s3",
    };
  }
  const safeCaseId = safeSegment(caseId);
  const safeEvidenceKey = safeSegment(evidenceKey);
  const caseDir = path.join(UPLOAD_ROOT, safeCaseId);
  if (storedKey) {
    const storedName = path.basename(storedKey);
    const absolutePath = path.join(caseDir, storedName);
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (stat) {
      return {
        absolutePath,
        file_name: preferredFileName || storedName,
        size_bytes: stat.size,
        uploaded_at: stat.mtime.toISOString(),
        storage_provider: "local",
      };
    }
  }
  const entries = await fs.readdir(caseDir).catch(() => []);
  const matching = await Promise.all(entries
    .filter((entry) => entry.startsWith(`${safeEvidenceKey}-`))
    .map(async (entry) => {
      const absolutePath = path.join(caseDir, entry);
      const stat = await fs.stat(absolutePath);
      return { entry, stat };
    }));
  matching.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  if (!matching.length) return null;
  const { entry: storedName, stat } = matching[0];
  const absolutePath = path.join(caseDir, storedName);
  return {
    absolutePath,
    file_name: preferredFileName || storedName,
    size_bytes: stat.size,
    uploaded_at: stat.mtime.toISOString(),
    storage_provider: "local",
  };
}

export async function readEvidenceUpload(caseId, evidenceKey, storedKey) {
  const upload = await findEvidenceUpload(caseId, evidenceKey, storedKey);
  if (!upload) return null;
  if (upload.storage_provider === "s3") return Buffer.from(await upload.body.transformToByteArray());
  return fs.readFile(upload.absolutePath);
}
