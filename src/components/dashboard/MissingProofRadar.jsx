import React from "react";
import { Radar, CheckCircle2, XCircle, Sparkles, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { EVIDENCE_LABELS, getRequired, hasEvidence } from "@/lib/ruleEngine";
import AttachProofButton from "./AttachProofButton";

function EvidenceFileMeta({ file }) {
  if (!file) return null;
  const fileName = typeof file === "string" ? file : file.file_name;
  const uploadedAt = typeof file === "object" && file.uploaded_at
    ? new Date(file.uploaded_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
  const content = (
    <>
      <Paperclip className="w-3 h-3" /> {fileName}
      {uploadedAt ? <span className="text-slate-300">| {uploadedAt}</span> : null}
    </>
  );
  if (typeof file === "object" && file.download_url) {
    return (
      <a href={file.download_url} className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 truncate max-w-[240px]">
        {content}
      </a>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 truncate max-w-[240px]">
      {content}
    </span>
  );
}

export default function MissingProofRadar({ caseItem, recentlyAttached = [], attachments, onAttach }) {
  if (!caseItem) return null;
  const required = getRequired(caseItem.dispute_type);
  const have = required.filter((k) => hasEvidence(caseItem, k)).length;
  const coverage = required.length ? Math.round((have / required.length) * 100) : 100;

  const statusOf = (key) => {
    if (hasEvidence(caseItem, key)) {
      return recentlyAttached.includes(key) ? "added" : "available";
    }
    return "missing";
  };

  const STATUS_CFG = {
    available: { icon: CheckCircle2, iconColor: "text-emerald-500", label: "Available", badge: "bg-emerald-100 text-emerald-700" },
    missing: { icon: XCircle, iconColor: "text-red-500", label: "Missing", badge: "bg-red-100 text-red-700" },
    added: { icon: Sparkles, iconColor: "text-blue-500", label: "Added just now", badge: "bg-blue-100 text-blue-700" },
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Radar className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-900">Missing Proof</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Required proof for <span className="font-medium text-slate-700">{caseItem.dispute_type.replace(/_/g, " ")}</span>. Attach what is missing to make the response safer.
        </p>

        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span>Proof coverage</span>
          <span className="font-medium text-slate-700">{coverage}% | {have}/{required.length}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${coverage}%` }} />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Required Proof Checklist</h3>
        {required.length === 0 ? (
          <div className="text-sm text-slate-400 italic">No checklist defined for this dispute type.</div>
        ) : (
          <ul className="space-y-2">
            {required.map((key) => {
              const status = statusOf(key);
              const cfg = STATUS_CFG[status];
              const Icon = cfg.icon;
              const file = attachments?.[key];
              return (
                <li key={key} className="flex items-center justify-between gap-3 border border-slate-100 rounded-md p-3">
                  <div className="flex items-center gap-2.5">
                    <Icon className={cn("w-4 h-4 shrink-0", cfg.iconColor)} />
                    <div>
                      <div className="text-sm font-medium text-slate-800">{EVIDENCE_LABELS[key] || key}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn("inline-block text-[10px] font-medium px-1.5 py-0.5 rounded", cfg.badge)}>{cfg.label}</span>
                        <EvidenceFileMeta file={file} />
                      </div>
                    </div>
                  </div>
                  {status === "missing" && (
                    <AttachProofButton onUploaded={(fileName) => onAttach?.(key, fileName)} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
