import React from "react";
import { CheckCircle2, XCircle, User, CalendarClock, Building2, Paperclip } from "lucide-react";
import { EVIDENCE_LABELS } from "@/lib/ruleEngine";
import AttachProofButton from "./AttachProofButton";

function Field({ label, value, mono }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-sm text-slate-800 ${mono ? "font-mono" : ""}`}>{value || "-"}</div>
    </div>
  );
}

export default function EvidencePassport({ caseItem, onAttach, attachments }) {
  if (!caseItem) return null;
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Proof Checklist</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Case ID" value={caseItem.case_id} mono />
          <Field label="Payment ID" value={caseItem.payment_id} mono />
          <Field label="Order ID" value={caseItem.order_id} mono />
          <Field label="Dispute ID" value={caseItem.dispute_id} mono />
          <Field label="Refund ID" value={caseItem.refund_id} mono />
          <Field label="ARN" value={caseItem.arn} mono />
          <Field label="UTR" value={caseItem.utr} mono />
          <Field label="Amount" value={`INR ${caseItem.amount.toLocaleString("en-IN")}`} />
          <Field label="Payment Status" value={caseItem.payment_status} />
          <Field label="Refund Status" value={caseItem.refund_status} />
          <Field label="Delivery Status" value={caseItem.delivery_status} />
          <Field label="Customer" value={caseItem.customer_name} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" /> {caseItem.customer_name}</span>
          <span className="inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {caseItem.team} | {caseItem.owner}</span>
          <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Deadline {caseItem.deadline}</span>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">Customer Complaint</h3>
        <p className="text-sm text-slate-700 italic bg-slate-50 rounded-md p-3 border border-slate-100">
          "{caseItem.customer_message}"
        </p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Proof Readiness</span>
          <span className="text-sm font-semibold text-slate-800 tabular-nums">{caseItem.readiness_score}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${caseItem.readiness_score}%` }} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-emerald-700 mb-3">Proof Available</h3>
          {caseItem.available_evidence?.length ? (
            <ul className="space-y-1.5">
              {caseItem.available_evidence.map((e) => (
                <li key={e} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-slate-700">{EVIDENCE_LABELS[e] || e}</span>
                  {attachments?.[e] && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 truncate max-w-[140px]">
                      <Paperclip className="w-3 h-3" /> {attachments[e]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-slate-400 italic">None</div>
          )}
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-red-600 mb-3">Proof Missing</h3>
          {caseItem.missing_evidence?.length ? (
            <ul className="space-y-2">
              {caseItem.missing_evidence.map((e) => (
                <li key={e} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <XCircle className="w-4 h-4 text-red-500" />
                    {EVIDENCE_LABELS[e] || e}
                  </span>
                  <AttachProofButton onUploaded={(fileName) => onAttach?.(e, fileName)} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-emerald-700 bg-emerald-50 rounded-md p-3">All evidence attached.</div>
          )}
        </div>
      </div>
    </div>
  );
}
