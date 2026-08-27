import React, { useEffect, useState } from "react";
import { CheckCircle2, Pencil, AlertTriangle, XCircle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_TONE = {
  draft: "bg-slate-100 text-slate-600",
  approved: "bg-emerald-100 text-emerald-700",
  escalated: "bg-red-100 text-red-700",
  accepted: "bg-amber-100 text-amber-700",
};

const OUTCOME_COPY = {
  draft: {
    title: "Waiting for final merchant decision",
    body: "The packet remains internal until a reviewer approves, escalates, accepts, or edits it.",
  },
  approved: {
    title: "Packet approved for dispute workflow",
    body: "The response packet is locked for audit and can be exported or submitted through the merchant dispute process.",
  },
  escalated: {
    title: "Escalated to senior review",
    body: "Proof gaps or low confidence require a human operations owner before any contest/refund action.",
  },
  accepted: {
    title: "Merchant liability accepted",
    body: "The case is marked for accept/refund handling and remains traceable in the audit log.",
  },
};

export default function HumanApproval({ caseItem, onApprove, onEscalate, onAccept, onEditDraft }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(caseItem?.merchant_response_draft || "");

  useEffect(() => {
    setDraft(caseItem?.merchant_response_draft || "");
    setEditing(false);
  }, [caseItem?.id, caseItem?.merchant_response_draft]);

  if (!caseItem) return null;
  const status = caseItem.packet_status;
  const outcome = OUTCOME_COPY[status] || OUTCOME_COPY.draft;

  const saveEdit = () => {
    onEditDraft(draft);
    setEditing(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Human Approval</h3>
          <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded uppercase tracking-wide", STATUS_TONE[status])}>
            {status}
          </span>
        </div>
        <div className="mt-3 flex items-start gap-2 text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-md p-3">
          <Lock className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          Every response packet requires reviewer approval before external action.
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-900">Merchant Response Draft</h3>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50">
              <Pencil className="w-3.5 h-3.5" /> Edit response
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={saveEdit} className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800">Save</button>
            </div>
          )}
        </div>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="w-full text-sm rounded-md border border-slate-200 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50 rounded-md p-3 border border-slate-100">
            {caseItem.merchant_response_draft}
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Decision</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <button
            onClick={onApprove}
            disabled={status !== "draft"}
            className="inline-flex flex-col items-center gap-1 px-3 py-3 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-xs font-medium">Approve packet</span>
          </button>
          <button
            onClick={onEscalate}
            disabled={status !== "draft"}
            className="inline-flex flex-col items-center gap-1 px-3 py-3 rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <AlertTriangle className="w-5 h-5" />
            <span className="text-xs font-medium">Escalate to human</span>
          </button>
          <button
            onClick={onAccept}
            disabled={status !== "draft"}
            className="inline-flex flex-col items-center gap-1 px-3 py-3 rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <XCircle className="w-5 h-5" />
            <span className="text-xs font-medium">Accept dispute</span>
          </button>
          <button
            onClick={() => setEditing(true)}
            disabled={status !== "draft"}
            className="inline-flex flex-col items-center gap-1 px-3 py-3 rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Pencil className="w-5 h-5" />
            <span className="text-xs font-medium">Edit response</span>
          </button>
        </div>
        {status !== "draft" && (
          <p className="mt-3 text-xs text-slate-500">
            Packet is <span className="font-semibold uppercase">{status}</span>. This decision is recorded in the audit log.
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Next System State</h3>
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-semibold text-slate-900">{outcome.title}</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{outcome.body}</p>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">External action</div>
            <div className="mt-1 text-xs font-medium text-slate-800">Reviewer approved</div>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Audit</div>
            <div className="mt-1 text-xs font-medium text-slate-800">Decision recorded</div>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Packet</div>
            <div className="mt-1 text-xs font-medium text-slate-800">{status === "draft" ? "Editable" : "Locked state"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
