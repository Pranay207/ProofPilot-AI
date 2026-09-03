import React, { useState } from "react";
import EvidencePassport from "./EvidencePassport";
import PaymentTimeline from "./PaymentTimeline";
import MissingProofRadar from "./MissingProofRadar";
import DisputePacket from "./DisputePacket";
import HumanApproval from "./HumanApproval";
import { CheckCircle2, ClipboardCheck, FileText, Radar, ShieldCheck, Sparkles, Target, Trash2, UserCheck, PackageCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EVIDENCE_LABELS, getRequired, hasEvidence, riskTone, readinessTone, actionTone } from "@/lib/ruleEngine";

const TABS = [
  { id: "evidence-passport", label: "Proof Checklist" },
  { id: "timeline", label: "What Happened" },
  { id: "missing-proof", label: "Missing Proof" },
  { id: "dispute-packet", label: "Response Draft" },
  { id: "human-approval", label: "Final Decision" },
];

const toneClasses = {
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  emerald: "bg-emerald-100 text-emerald-700",
  blue: "bg-blue-100 text-blue-700",
};

const textTone = {
  red: "text-red-600",
  amber: "text-amber-600",
  emerald: "text-emerald-600",
  blue: "text-blue-600",
};

function Bar({ value, tone }) {
  const colors = { red: "bg-red-500", amber: "bg-amber-500", emerald: "bg-emerald-500", blue: "bg-blue-500" };
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", colors[tone])} style={{ width: `${value}%` }} />
    </div>
  );
}

function ScoreExplanation({ caseItem }) {
  const required = getRequired(caseItem.dispute_type);
  const present = required.filter((key) => hasEvidence(caseItem, key));
  const missing = required.filter((key) => !hasEvidence(caseItem, key));
  const modelReasons = caseItem.model_reasons?.length ? caseItem.model_reasons : ["Baseline dispute pattern"];
  const aiJudgment = caseItem.ai_judgment || {};
  const extracted = aiJudgment.extracted_signals || {};

  return (
    <div className="grid lg:grid-cols-3 gap-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Target className="w-4 h-4 text-red-500" />
          Risk Score
        </div>
        <div className="mt-2 text-sm text-slate-700">
          Model predicts <span className="font-semibold text-slate-900">{caseItem.model_probability ?? caseItem.risk_score}%</span> chance of merchant loss, then rules adjust for deadline and missing proof.
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {modelReasons.slice(0, 4).map((reason) => (
            <span key={reason} className="rounded bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700">
              {reason}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <ClipboardCheck className="w-4 h-4 text-emerald-600" />
          Proof Readiness
        </div>
        <div className="mt-2 text-sm text-slate-700">
          {present.length}/{required.length} required proofs are present.
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          Missing: {missing.length ? missing.slice(0, 3).map((key) => EVIDENCE_LABELS[key] || key).join(", ") : "none"}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          AI Judgment
        </div>
        <div className="mt-2 text-sm text-slate-700">
          Intent: <span className="font-semibold text-slate-900">{(aiJudgment.intent || caseItem.dispute_type).replace(/_/g, " ")}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {extracted.refund_mention && <span className="rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">refund mention</span>}
          {extracted.delivery_claim && <span className="rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">delivery claim</span>}
          {extracted.fraud_claim && <span className="rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">fraud claim</span>}
          {(extracted.dates || []).slice(0, 2).map((date) => (
            <span key={date} className="rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">{date}</span>
          ))}
          {!extracted.refund_mention && !extracted.delivery_claim && !extracted.fraud_claim && !(extracted.dates || []).length && (
            <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">no extra signals</span>
          )}
        </div>
        <div className="mt-2 text-[11px] font-medium text-blue-700">AI cannot submit. Human approval required.</div>
      </div>
    </div>
  );
}

function WorkflowProgress({ caseItem }) {
  const required = getRequired(caseItem.dispute_type);
  const hasRequiredEvidence = required.length > 0 && required.every((key) => hasEvidence(caseItem, key));
  const stages = [
    { label: "Intake", icon: Radar, done: Boolean(caseItem.payment_id && caseItem.dispute_id) },
    { label: "Detect", icon: ShieldCheck, done: Number(caseItem.risk_score || 0) > 0 },
    { label: "Verify", icon: ClipboardCheck, done: hasRequiredEvidence },
    { label: "Draft", icon: Sparkles, done: Boolean(caseItem.merchant_response_draft) },
    { label: "Approve", icon: UserCheck, done: caseItem.packet_status !== "draft" },
    { label: "Export", icon: FileText, done: (caseItem.audit_log || []).some((item) => item.action === "packet_exported") },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended Path</h3>
          <p className="mt-0.5 text-xs text-slate-500">Detect risk, check proof, draft response, approve, and export.</p>
        </div>
        <div className="text-right">
          <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-medium uppercase text-slate-600">
            {caseItem.workflow?.state?.replace(/_/g, " ") || caseItem.packet_status || "draft"}
          </span>
          <p className="mt-1 max-w-xs text-[11px] text-slate-500">
            {caseItem.workflow?.next_safe_action || "Reviewer must approve the final action."}
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {stages.map((stage) => {
          const Icon = stage.icon;
          return (
            <div key={stage.label} className={cn("rounded-md border px-3 py-2", stage.done ? "border-emerald-100 bg-emerald-50" : "border-slate-200 bg-slate-50")}>
              <div className="flex items-center gap-2">
                {stage.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Icon className="h-4 w-4 text-slate-400" />}
                <span className={cn("text-xs font-medium", stage.done ? "text-emerald-800" : "text-slate-500")}>{stage.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isManualCase(caseItem) {
  return (caseItem.audit_log || []).some((log) => log.actor === "Merchant Ops" && log.action === "case_created");
}

function formatRazorpayAmount(caseItem) {
  return `${Number(caseItem.amount || 0).toLocaleString("en-IN")} ${caseItem.currency || "INR"}`;
}

function formatDueDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue || "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CaseDetail({
  caseItem,
  activeTab,
  onTabChange,
  onAttach,
  onRemoveEvidence,
  recentlyAttached,
  attachments,
  onApprove,
  onEscalate,
  onAccept,
  onSubmit,
  onEditDraft,
  onExportPacket,
  onExportPdf,
  onDelete,
  onSyncShiprocket,
}) {
  const [localTab, setLocalTab] = useState("evidence-passport");
  const [syncingShiprocket, setSyncingShiprocket] = useState(false);
  const tab = activeTab || localTab;

  if (!caseItem) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-slate-500">
        Select a case from the Action Queue to see what happened, what proof is missing, and what action is safest.
      </div>
    );
  }

  const risk = riskTone(caseItem.risk_score);
  const ready = readinessTone(caseItem.readiness_score);
  const act = actionTone(caseItem.recommended_action);
  const canDelete = isManualCase(caseItem);

  const handleSyncShiprocket = async () => {
    if (!onSyncShiprocket) return;
    setSyncingShiprocket(true);
    try {
      await onSyncShiprocket();
    } finally {
      setSyncingShiprocket(false);
    }
  };

  const setTab = (id) => {
    setLocalTab(id);
    onTabChange?.(id);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">{caseItem.customer_name}</h2>
              <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded uppercase", toneClasses[act.color])}>{act.label}</span>
              {caseItem.arn && (
                <span className="font-mono text-[11px] rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-slate-700">
                  AWB: {caseItem.arn}
                </span>
              )}
              {onSyncShiprocket && (
                <button
                  type="button"
                  onClick={handleSyncShiprocket}
                  disabled={syncingShiprocket}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-3 py-1 text-xs font-semibold shadow-xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                  title="Fetch live delivery proof & courier tracking from Shiprocket"
                >
                  {syncingShiprocket ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                  ) : (
                    <PackageCheck className="h-3.5 w-3.5 text-emerald-600" />
                  )}
                  <span>Sync Shiprocket Tracking</span>
                </button>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="font-mono">dispute_id: {caseItem.dispute_id}</span>
              <span className="font-mono">payment_id: {caseItem.payment_id}</span>
              <span className="font-mono">amount: {formatRazorpayAmount(caseItem)}</span>
              <span>status: {caseItem.status || "open"}</span>
              <span>Response due: {formatDueDate(caseItem.respond_by || caseItem.deadline)}</span>
              <span>| {caseItem.team} | {caseItem.owner}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                Model loss probability: {caseItem.model_probability ?? caseItem.risk_score}%
              </span>
              {(caseItem.model_reasons || []).slice(0, 3).map((reason) => (
                <span key={reason} className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
                  {reason}
                </span>
              ))}
            </div>
          </div>
          <div className="flex min-w-[260px] flex-col items-stretch gap-3">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-[11px] text-slate-400 uppercase">Risk</div>
                <div className={cn("text-xs font-medium mb-1", textTone[risk.color])}>{risk.label} | {caseItem.risk_score}</div>
                <Bar value={caseItem.risk_score} tone={risk.color} />
              </div>
              <div>
                <div className="text-[11px] text-slate-400 uppercase">Readiness</div>
                <div className={cn("text-xs font-medium mb-1", textTone[ready.color])}>{ready.label} | {caseItem.readiness_score}%</div>
                <Bar value={caseItem.readiness_score} tone={ready.color} />
              </div>
              <div>
                <div className="text-[11px] text-slate-400 uppercase">Confidence</div>
                <div className="text-xs font-medium mb-1 text-slate-700">{caseItem.confidence_score}%</div>
                <Bar value={caseItem.confidence_score} tone="blue" />
              </div>
            </div>
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center justify-center gap-1.5 self-end rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete test case
              </button>
            )}
          </div>
        </div>
      </div>

      <WorkflowProgress caseItem={caseItem} />

      <ScoreExplanation caseItem={caseItem} />

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "evidence-passport" && <EvidencePassport caseItem={caseItem} onAttach={onAttach} onRemove={onRemoveEvidence} attachments={attachments} />}
        {tab === "timeline" && <PaymentTimeline caseItem={caseItem} />}
        {tab === "missing-proof" && <MissingProofRadar caseItem={caseItem} recentlyAttached={recentlyAttached} attachments={attachments} onAttach={onAttach} onRemove={onRemoveEvidence} />}
        {tab === "dispute-packet" && <DisputePacket caseItem={caseItem} onExport={onExportPacket} onExportPdf={onExportPdf} />}
        {tab === "human-approval" && (
          <HumanApproval
            caseItem={caseItem}
            onApprove={onApprove}
            onEscalate={onEscalate}
            onAccept={onAccept}
            onSubmit={onSubmit}
            onEditDraft={onEditDraft}
          />
        )}
      </div>
    </div>
  );
}
