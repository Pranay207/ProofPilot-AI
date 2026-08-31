import React from "react";
import { ExternalLink, FileText, Trash2 } from "lucide-react";
import AttachProofButton from "./AttachProofButton";

function formatUploadedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function storageLabel(file) {
  if (file?.storage_status) return file.storage_status;
  if (file?.storage_provider === "s3") return "Cloud storage";
  if (file?.storage_provider) return "Local storage";
  return "Attached";
}

export default function EvidenceFileActions({ evidenceKey, file, onReplace, onRemove }) {
  if (!file) return null;
  const fileName = typeof file === "string" ? file : file.file_name;
  const uploadedAt = typeof file === "object" ? formatUploadedAt(file.uploaded_at) : "";
  const size = typeof file === "object" ? formatSize(file.size_bytes) : "";
  const downloadUrl = typeof file === "object" ? file.download_url : "";

  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-slate-800">
            <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span className="truncate" title={fileName}>{fileName}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-500">
            {uploadedAt && <span>Uploaded {uploadedAt}</span>}
            {size && <span>{size}</span>}
            <span>{storageLabel(file)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {downloadUrl && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              aria-label={`Preview ${fileName}`}
              title="Preview"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <AttachProofButton label="Replace" compact onUploaded={(payload) => onReplace?.(evidenceKey, payload)} />
          <button
            type="button"
            onClick={() => onRemove?.(evidenceKey)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50"
            aria-label={`Remove ${fileName}`}
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
