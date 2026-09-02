const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function sanitize(value) {
  return String(value ?? "")
    .replaceAll("\u20B9", "INR ")
    .replaceAll("\u2014", "-")
    .replaceAll("\u2013", "-")
    .replaceAll("\u2018", "'")
    .replaceAll("\u2019", "'")
    .replaceAll("\u201C", '"')
    .replaceAll("\u201D", '"')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function escapePdfText(value) {
  return sanitize(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return sanitize(value);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return sanitize(value);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAmount(caseItem) {
  return `${Number(caseItem.amount || 0).toLocaleString("en-IN")} ${caseItem.currency || "INR"}`;
}

function wrapText(text, maxChars) {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

class SimplePdf {
  constructor() {
    this.pages = [];
    this.addPage();
  }

  addPage() {
    this.current = { ops: [], y: PAGE_HEIGHT - MARGIN };
    this.pages.push(this.current);
  }

  ensureSpace(height) {
    if (this.current.y - height < MARGIN) this.addPage();
  }

  text(value, { x = MARGIN, size = 10, font = "F1", leading = size + 5, width = CONTENT_WIDTH, gap = 0 } = {}) {
    const maxChars = Math.max(18, Math.floor(width / (size * 0.5)));
    const lines = wrapText(value, maxChars);
    this.ensureSpace(lines.length * leading + gap);
    for (const line of lines) {
      this.current.ops.push(`BT /${font} ${size} Tf 1 0 0 1 ${x} ${this.current.y} Tm (${escapePdfText(line)}) Tj ET`);
      this.current.y -= leading;
    }
    this.current.y -= gap;
  }

  rule(gap = 14) {
    this.ensureSpace(gap + 6);
    const y = this.current.y;
    this.current.ops.push(`0.75 w ${MARGIN} ${y} m ${PAGE_WIDTH - MARGIN} ${y} l S`);
    this.current.y -= gap;
  }

  section(title) {
    this.ensureSpace(30);
    this.current.y -= 6;
    this.text(title, { size: 13, font: "F2", gap: 4 });
    this.rule(12);
  }

  keyValue(label, value) {
    this.text(`${label}: ${value || "-"}`, { size: 10, font: "F1", leading: 14 });
  }
}

function buildPdfBuffer(pages) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  const pageObjectIds = [];

  for (const page of pages) {
    const stream = page.ops.join("\n");
    const contentObjectId = objects.length + 1;
    objects.push(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
    const pageObjectId = objects.length + 1;
    pageObjectIds.push(pageObjectId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
  }

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function evidenceRows(caseItem) {
  const files = caseItem.evidence_files || {};
  const keys = [...new Set([...(caseItem.available_evidence || []), ...Object.keys(files)])];
  return keys.map((key) => ({
    key,
    file: files[key],
  }));
}

export function buildDisputePacketPdf(caseItem, { merchant } = {}) {
  if (!caseItem) {
    const error = new Error("Case not found");
    error.status = 404;
    throw error;
  }

  const pdf = new SimplePdf();
  pdf.text("ProofPilot AI", { size: 20, font: "F2", leading: 24 });
  pdf.text("PDF Dispute Packet Export", { size: 11, font: "F1", gap: 8 });
  pdf.rule(16);

  pdf.keyValue("Case ID", caseItem.case_id);
  pdf.keyValue("Dispute ID", caseItem.dispute_id);
  pdf.keyValue("Dispute Reason", caseItem.reason_description || caseItem.dispute_reason);
  pdf.keyValue("Amount", formatAmount(caseItem));
  pdf.keyValue("Merchant", merchant?.name || caseItem.team || "Merchant Risk Workspace");
  pdf.keyValue("Submission Date", formatDate(new Date()));
  pdf.keyValue("Response Due", formatDate(caseItem.respond_by || caseItem.deadline));

  pdf.section("1. Executive Summary & AI Drafted Defense Response");
  pdf.text(caseItem.case_summary || "No executive summary available.", { size: 10, leading: 15, gap: 8 });
  pdf.text("AI Drafted Defense Response", { size: 11, font: "F2", gap: 4 });
  pdf.text(caseItem.merchant_response_draft || "No response draft available.", { size: 10, leading: 15 });

  pdf.section("2. Case Timeline & System Audit Trail");
  pdf.text("Case Timeline", { size: 11, font: "F2", gap: 4 });
  const timeline = caseItem.timeline_events || [];
  if (!timeline.length) {
    pdf.text("No timeline events recorded.", { size: 10, leading: 14 });
  } else {
    timeline.forEach((item) => {
      pdf.text(`${formatTimestamp(item.timestamp)} | ${item.event || "event"} | ${item.detail || ""}`, { size: 9, leading: 13 });
    });
  }

  pdf.text("System Audit Trail", { size: 11, font: "F2", gap: 4 });
  const audit = caseItem.audit_log || [];
  if (!audit.length) {
    pdf.text("No audit events recorded.", { size: 10, leading: 14 });
  } else {
    audit.forEach((item) => {
      pdf.text(`${formatTimestamp(item.timestamp)} | ${item.actor || "System"} | ${item.action || "action"} | ${item.detail || ""}`, { size: 9, leading: 13 });
    });
  }

  pdf.section("3. Attached Evidence Index");
  const rows = evidenceRows(caseItem);
  if (!rows.length) {
    pdf.text("No attached evidence files are linked to this case.", { size: 10, leading: 14 });
  } else {
    rows.forEach((row, index) => {
      const file = row.file || {};
      const name = file.file_name || "Record available";
      const status = file.storage_status || file.storage_provider || "Attached";
      const uploaded = file.uploaded_at ? formatTimestamp(file.uploaded_at) : "Timestamp not recorded";
      pdf.text(`${index + 1}. ${row.key} | ${name}`, { size: 10, font: "F2", leading: 14 });
      pdf.text(`   Storage: ${status} | Uploaded: ${uploaded} | Size: ${file.size_bytes ? `${file.size_bytes} bytes` : "not recorded"}`, { size: 9, leading: 13 });
    });
  }

  return buildPdfBuffer(pdf.pages);
}
