import React from "react";
import { Radar, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { EVIDENCE_LABELS, getRequired, hasEvidence } from "@/lib/ruleEngine";
import AttachProofButton from "./AttachProofButton";
import EvidenceFileActions from "./EvidenceFileActions";

export default function MissingProofRadar({ caseItem, recentlyAttached = [], attachments, onAttach, onRemove }) {
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
                <li key={key} className="border border-slate-100 rounded-md p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <Icon className={cn("mt-0.5 w-4 h-4 shrink-0", cfg.iconColor)} />
                      <div>
                        <div className="text-sm font-medium text-slate-800">{EVIDENCE_LABELS[key] || key}</div>
                        <div className="mt-1">
                          <span className={cn("inline-block text-[10px] font-medium px-1.5 py-0.5 rounded", cfg.badge)}>{cfg.label}</span>
                        </div>
                      </div>
                    </div>
                    {status === "missing" && (
                      <AttachProofButton onUploaded={(payload) => onAttach?.(key, payload)} />
                    )}
                  </div>
                  {status !== "missing" && file && (
                    <EvidenceFileActions
                      evidenceKey={key}
                      file={file}
                      onReplace={onAttach}
                      onRemove={onRemove}
                    />
                  )}
                  {status !== "missing" && !file && (
                    <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-amber-100 bg-amber-50 p-2">
                      <span className="text-xs text-amber-800">Confirmed in case record. Attach a source file for the packet.</span>
                      <AttachProofButton label="Add file" compact onUploaded={(payload) => onAttach?.(key, payload)} />
                    </div>
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
