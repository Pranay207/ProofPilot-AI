import React from "react";
import { Download, FileText, Sparkles, ShieldAlert } from "lucide-react";
import { actionTone, EVIDENCE_LABELS } from "@/lib/ruleEngine";

const toneClasses = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
};

const TYPE_LABEL = {
  goods_not_received: "Goods not received",
  refund_not_processed: "Refund not processed",
  duplicate_payment: "Duplicate payment",
  unauthorized_transaction: "Unauthorized transaction",
  product_not_as_described: "Product not as described",
  cancelled_subscription: "Cancelled subscription charged",
};

function labelEvidence(items = []) {
  return items.map((item) => EVIDENCE_LABELS[item] || item);
}

function exportPacket(caseItem, actionLabel) {
  const packet = {
    generated_at: new Date().toISOString(),
    product: "ProofPilot AI",
    case: {
      case_id: caseItem.case_id,
      customer: caseItem.customer_name,
      dispute_type: TYPE_LABEL[caseItem.dispute_type] || caseItem.dispute_type,
      order_id: caseItem.order_id,
      payment_id: caseItem.payment_id,
      dispute_id: caseItem.dispute_id,
      amount: caseItem.amount,
      deadline: caseItem.deadline,
    },
    scores: {
      risk_score: caseItem.risk_score,
      model_loss_probability: caseItem.model_probability ?? caseItem.risk_score,
      readiness_score: caseItem.readiness_score,
      confidence_score: caseItem.confidence_score,
      model_reasons: caseItem.model_reasons || [],
    },
    decision: {
      recommended_action: actionLabel,
      reason: caseItem.action_reason,
      human_approval_required: true,
    },
    evidence: {
      available: labelEvidence(caseItem.available_evidence),
      missing: labelEvidence(caseItem.missing_evidence),
    },
    response_draft: caseItem.merchant_response_draft,
    audit_guardrail: "AI generated draft only. Merchant human approval required before external submission.",
  };

  const blob = new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${caseItem.case_id || "proofpilot"}-dispute-packet.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return packet;
}

export default function DisputePacket({ caseItem, onExport }) {
  if (!caseItem) return null;
  const act = actionTone(caseItem.recommended_action);
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-900">Dispute Packet</h3>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:inline text-[11px] text-slate-400">AI-generated draft | human approval required</span>
            <button
              type="button"
              onClick={() => {
                const packet = exportPacket(caseItem, act.label);
                onExport?.(packet);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" />
              Export packet
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-[11px] uppercase text-slate-400">Dispute Type</div>
            <div className="text-sm font-medium text-slate-800">{TYPE_LABEL[caseItem.dispute_type] || caseItem.dispute_type?.replace(/_/g, " ")}</div>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-[11px] uppercase text-slate-400">Confidence Score</div>
            <div className="text-sm font-medium text-slate-800 tabular-nums">{caseItem.confidence_score}%</div>
          </div>
        </div>

        <div className={`rounded-md border p-3 ${toneClasses[act.color]}`}>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />
            <span className="text-[11px] uppercase tracking-wide font-semibold">Recommended Action</span>
          </div>
          <div className="mt-1 text-sm font-semibold">{act.label}</div>
          <p className="text-xs mt-1 opacity-80">{caseItem.action_reason}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">Case Summary</h3>
        <p className="text-sm text-slate-700 leading-relaxed">{caseItem.case_summary}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-emerald-700 mb-2">Evidence Used</h3>
          <ul className="space-y-1 text-sm text-slate-700">
            {(caseItem.available_evidence || []).map((e) => (
              <li key={e}>- {EVIDENCE_LABELS[e] || e}</li>
            ))}
            {!caseItem.available_evidence?.length && <li className="text-slate-400 italic">None</li>}
          </ul>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-red-600 mb-2">Missing Evidence</h3>
          <ul className="space-y-1 text-sm text-slate-700">
            {(caseItem.missing_evidence || []).map((e) => (
              <li key={e}>- {EVIDENCE_LABELS[e] || e}</li>
            ))}
            {!caseItem.missing_evidence?.length && <li className="text-slate-400 italic">None</li>}
          </ul>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-900">Merchant Response Draft</h3>
          <span className="ml-auto text-[11px] text-slate-400">editable in Human Approval</span>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50 rounded-md p-3 border border-slate-100">
          {caseItem.merchant_response_draft}
        </p>
      </div>
    </div>
  );
}
