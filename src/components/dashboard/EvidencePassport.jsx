import React from "react";
import { CheckCircle2, XCircle, User, CalendarClock, Building2 } from "lucide-react";
import { EVIDENCE_LABELS, getRequired, hasEvidence } from "@/lib/ruleEngine";
import AttachProofButton from "./AttachProofButton";
import EvidenceFileActions from "./EvidenceFileActions";

function Field({ label, value, mono }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className={`mt-0.5 text-sm text-slate-900 ${mono ? "font-mono" : ""}`}>{value || "-"}</div>
    </div>
  );
}

function formatAmount(caseItem) {
  const currency = caseItem.currency || "INR";
  return `${Number(caseItem.amount || 0).toLocaleString("en-IN")} ${currency}`;
}

export default function EvidencePassport({ caseItem, onAttach, onRemove, attachments }) {
  if (!caseItem) return null;
  const required = getRequired(caseItem.dispute_type);
  const availableCount = required.filter((key) => hasEvidence(caseItem, key)).length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Proof Checklist</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Case ID" value={caseItem.case_id} mono />
          <Field label="dispute_id" value={caseItem.dispute_id} mono />
          <Field label="payment_id" value={caseItem.payment_id} mono />
          <Field label="Order ID" value={caseItem.order_id} mono />
          <Field label="amount" value={formatAmount(caseItem)} />
          <Field label="amount_deducted" value={`${Number(caseItem.amount_deducted || 0).toLocaleString("en-IN")} ${caseItem.currency || "INR"}`} />
          <Field label="reason_code" value={caseItem.reason_code || caseItem.dispute_type} mono />
          <Field label="reason_description" value={caseItem.reason_description || caseItem.dispute_reason} />
          <Field label="respond_by" value={caseItem.respond_by || caseItem.deadline} />
          <Field label="status" value={caseItem.status || "open"} />
          <Field label="Refund ID" value={caseItem.refund_id} mono />
          <Field label="ARN" value={caseItem.arn} mono />
          <Field label="UTR" value={caseItem.utr} mono />
          <Field label="Payment Status" value={caseItem.payment_status} />
          <Field label="Refund Status" value={caseItem.refund_status} />
          <Field label="Delivery Status" value={caseItem.delivery_status} />
          <Field label="Customer" value={caseItem.customer_name} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" /> {caseItem.customer_name}</span>
          <span className="inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {caseItem.team} | {caseItem.owner}</span>
          <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> respond_by {caseItem.respond_by || caseItem.deadline}</span>
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

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Required Proof Checklist</h3>
            <p className="mt-0.5 text-xs text-slate-500">{availableCount}/{required.length} required items attached for this case type.</p>
          </div>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
            {caseItem.dispute_type.replace(/_/g, " ")}
          </span>
        </div>
        {required.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {required.map((e) => {
              const available = hasEvidence(caseItem, e);
              const file = attachments?.[e];
              return (
                <div key={e} className="rounded-lg border border-slate-100 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      {available ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800">{EVIDENCE_LABELS[e] || e}</div>
                        <div className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${available ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {available ? "Attached" : "Missing"}
                        </div>
                      </div>
                    </div>
                    {!available && <AttachProofButton onUploaded={(payload) => onAttach?.(e, payload)} />}
                  </div>
                  {available && file && (
                    <EvidenceFileActions
                      evidenceKey={e}
                      file={file}
                      onReplace={onAttach}
                      onRemove={onRemove}
                    />
                  )}
                  {available && !file && (
                    <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-2">
                      <span className="text-xs text-slate-500">Record available. Add a file when source proof is needed.</span>
                      <AttachProofButton label="Add file" compact onUploaded={(payload) => onAttach?.(e, payload)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">No required proof checklist is configured for this case type.</div>
        )}
      </div>
    </div>
  );
}
