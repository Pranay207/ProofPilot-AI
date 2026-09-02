import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  CheckCircle2,
  Database,
  FileCheck2,
  IndianRupee,
  Info,
  Loader2,
  Menu,
  MessageSquare,
  PackageCheck,
  PlusCircle,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UploadCloud,
  UserCheck,
  X,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import SummaryCards from "@/components/dashboard/SummaryCards";
import RiskQueue from "@/components/dashboard/RiskQueue";
import CaseDetail from "@/components/dashboard/CaseDetail";
import MetricsDashboard from "@/components/dashboard/MetricsDashboard";
import AuditLogView from "@/components/dashboard/AuditLogView";
import AnimatedValue from "@/components/dashboard/AnimatedValue";
import ReliabilityDashboard from "@/components/dashboard/ReliabilityDashboard";
import { actionTone, scoreCase, EVIDENCE_LABELS, getRequired } from "@/lib/ruleEngine";
import { calculateProofPilotMetrics, formatMoney } from "@/lib/metrics";
import { fetchBackendMetrics } from "@/lib/metricsApi";
import { apiFetch } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

const CASE_SECTIONS = ["evidence-passport", "timeline", "missing-proof", "dispute-packet", "human-approval"];
const PAGE_TITLES = {
  overview: "Overview",
  "risk-queue": "Action Queue",
  metrics: "Risk Intelligence",
  reliability: "System Health",
  "audit-log": "Audit Trail",
};

const DISPUTE_TYPES = [
  "goods_not_received",
  "refund_not_processed",
  "duplicate_payment",
  "unauthorized_transaction",
  "product_not_as_described",
  "cancelled_subscription",
];
const TYPE_LABEL = {
  goods_not_received: "Goods not received",
  refund_not_processed: "Refund not processed",
  duplicate_payment: "Duplicate payment",
  unauthorized_transaction: "Unauthorized transaction",
  product_not_as_described: "Product not as described",
  cancelled_subscription: "Cancelled subscription charged",
};

const DEFAULT_BY_TYPE = {
  goods_not_received: {
    dispute_reason: "Customer claims goods not received",
    customer_message: "I never received my order even though it shows shipped. I want a refund.",
    payment_status: "captured",
    refund_status: "none",
    delivery_status: "shipped_no_proof",
  },
  refund_not_processed: {
    dispute_reason: "Customer claims refund not received",
    customer_message: "The merchant promised a refund but I have not received it yet.",
    payment_status: "captured",
    refund_status: "promised_not_processed",
    delivery_status: "not_applicable",
  },
  duplicate_payment: {
    dispute_reason: "Customer claims duplicate payment",
    customer_message: "I was charged twice for the same order. Please reverse one payment.",
    payment_status: "captured",
    refund_status: "none",
    delivery_status: "not_applicable",
  },
  unauthorized_transaction: {
    dispute_reason: "Customer claims payment was unauthorized",
    customer_message: "I did not authorize this payment and want the charge reversed.",
    payment_status: "captured",
    refund_status: "none",
    delivery_status: "digital_or_physical_fulfilled",
  },
  product_not_as_described: {
    dispute_reason: "Customer claims product was not as described",
    customer_message: "The item I received does not match the listing and I want a refund.",
    payment_status: "captured",
    refund_status: "none",
    delivery_status: "delivered",
  },
  cancelled_subscription: {
    dispute_reason: "Customer claims subscription was cancelled before charge",
    customer_message: "I cancelled my subscription but was still charged again.",
    payment_status: "captured",
    refund_status: "none",
    delivery_status: "not_applicable",
  },
};

function todayPlus(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isManualCase(caseItem) {
  return (caseItem?.audit_log || []).some((log) => log.actor === "Merchant Ops" && log.action === "case_created");
}

function QueueInsight({ onCreateCase }) {
  return (
    <div className="bg-slate-900 text-white rounded-lg border border-slate-800 px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-md bg-emerald-500 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-slate-950" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Resolve risky disputes before they become merchant losses.</h2>
          <p className="text-xs text-slate-300 mt-1">
            Open a case to see the risk, missing proof, safest action, reviewer decision, and export-ready response.
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 text-xs lg:min-w-[480px]">
        <div className="grid grid-cols-3 gap-3 flex-1">
          <div className="bg-white/10 rounded-md px-3 py-2">
            <div className="text-slate-400">Workflow</div>
            <div className="font-semibold mt-1">Case to action</div>
          </div>
          <div className="bg-white/10 rounded-md px-3 py-2">
            <div className="text-slate-400">AI role</div>
            <div className="font-semibold mt-1">Risk + proof</div>
          </div>
          <div className="bg-white/10 rounded-md px-3 py-2">
            <div className="text-slate-400">Final action</div>
            <div className="font-semibold mt-1">Reviewer approved</div>
          </div>
        </div>
        <button onClick={onCreateCase} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100">
          <PlusCircle className="h-3.5 w-3.5" /> New case
        </button>
      </div>
    </div>
  );
}

function ImpactCard({ icon: Icon, label, value, hint, tone }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    red: "bg-red-50 text-red-700 border-red-100",
  };

  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-600">{label}</div>
          <AnimatedValue value={value} className="mt-1 block text-2xl font-semibold tracking-tight text-slate-950 tabular-nums" />
          <div className="mt-1 text-xs font-medium leading-relaxed text-slate-600">{hint}</div>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function KpiBar({ metrics }) {
  const proofTotal = Math.max(Number(metrics.openCases || 0), 0);
  const readyHint = metrics.contestReadyCases
    ? `${metrics.contestReadyCases} contest-ready packet${metrics.contestReadyCases === 1 ? "" : "s"}`
    : "No contest-ready packets";
  const benefitHint = Number(metrics.netBenefit || 0) >= 0 ? "estimated recoverable value" : "review cost exceeds ready value";

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <ImpactCard icon={Radar} label="Cases Needing Action" value={metrics.openCases} hint={`${metrics.highRiskCases} high risk | ${metrics.totalCases} total`} tone="amber" />
      <ImpactCard icon={FileCheck2} label="Proof Ready" value={`${metrics.evidenceReadyCases}/${proofTotal}`} hint={readyHint} tone="emerald" />
      <ImpactCard icon={UserCheck} label="Waiting For Decision" value={metrics.awaitingApprovalCases} hint="reviewer approval required" tone="slate" />
      <ImpactCard icon={IndianRupee} label="Money At Risk" value={formatMoney(metrics.valueAtRisk)} hint="open draft/escalated cases" tone="blue" />
      <ImpactCard icon={IndianRupee} label="Ready To Recover" value={formatMoney(metrics.recoverableValue)} hint={readyHint} tone="emerald" />
      <ImpactCard icon={TrendingUp} label="Net Merchant Benefit" value={formatMoney(metrics.netBenefit)} hint={benefitHint} tone={Number(metrics.netBenefit || 0) >= 0 ? "blue" : "red"} />
    </section>
  );
}

function WorkflowStep({ icon: Icon, title, text, index, isLast }) {
  return (
    <div className="relative rounded-lg border border-slate-200 bg-white p-3">
      {!isLast && (
        <ArrowRight className="absolute -right-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 rounded-full bg-white text-slate-300 max-md:hidden" />
      )}
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-700">
          <Icon className="h-4 w-4" />
        </span>
        <span className="font-mono text-[11px] font-semibold text-slate-400">0{index}</span>
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs leading-snug text-slate-500">{text}</p>
    </div>
  );
}

function PriorityBoard({ cases, onSelectCase, onOpenQueue }) {
  const urgent = [...cases]
    .filter((caseItem) => ["draft", "escalated"].includes(caseItem.packet_status || "draft"))
    .sort((a, b) => (b.risk_score - b.readiness_score) - (a.risk_score - a.readiness_score))
    .slice(0, 7);

  const priorityReason = (caseItem) => {
    const missing = caseItem.missing_evidence || [];
    if (missing.length) {
      return `Missing ${missing.slice(0, 2).join(" + ")}`;
    }
    if (caseItem.recommended_action === "accept") {
      return "Likely merchant liability";
    }
    if (caseItem.recommended_action === "contest") {
      return "Evidence ready to contest";
    }
    return "Needs human review";
  };

  const readinessPill = (value) => {
    if (value >= 80) return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (value >= 40) return "border-amber-200 bg-amber-50 text-amber-700";
    return "border-slate-200 bg-slate-100 text-slate-700";
  };

  const formatRazorpayAmount = (caseItem) => `${Number(caseItem.amount || 0).toLocaleString("en-IN")} ${caseItem.currency || "INR"}`;
  const formatDueDate = (dateValue) => {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return dateValue || "-";
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div className="flex min-h-[430px] flex-1 flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Priority Board</h3>
          <p className="mt-1 text-xs font-medium text-slate-600">Start with cases most likely to lose money or miss proof.</p>
        </div>
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{urgent.length} active</span>
      </div>
      <div className="flex-1 divide-y divide-slate-100">
        {!urgent.length && (
          <div className="flex h-full min-h-[280px] items-center justify-center px-4 py-12 text-center">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">No active dispute risk</h3>
              <p className="mt-1 text-xs font-medium text-slate-600">New Razorpay disputes and manually created cases will appear here.</p>
            </div>
          </div>
        )}
        {urgent.map((caseItem) => {
          const action = actionTone(caseItem.recommended_action);
          return (
            <button
              key={caseItem.id}
              onClick={() => {
                onSelectCase(caseItem.id);
                onOpenQueue();
              }}
              className="grid w-full grid-cols-[minmax(0,1.4fr)_minmax(160px,0.8fr)_108px_118px_128px] items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 max-lg:grid-cols-1"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{caseItem.customer_name}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-700">
                    {caseItem.reason_code || caseItem.dispute_type}
                  </span>
                </div>
                <div className="mt-1 truncate font-mono text-xs text-slate-500">dispute_id: {caseItem.dispute_id}</div>
                <div className="mt-1 text-xs font-medium text-slate-600">{priorityReason(caseItem)}</div>
              </div>
              <div className="min-w-0 text-xs font-medium text-slate-600">
                <div className="truncate">{caseItem.reason_description || caseItem.dispute_reason}</div>
                <div className="mt-1 font-mono text-[11px] text-slate-500">payment_id: {caseItem.payment_id}</div>
                <div className="mt-1 text-[11px] font-semibold text-slate-700">amount: {formatRazorpayAmount(caseItem)}</div>
                <div className="mt-1 text-[11px] text-slate-500">Response due: {formatDueDate(caseItem.respond_by || caseItem.deadline)}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-slate-600">Risk</div>
                <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                  {caseItem.risk_score}
                </span>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-slate-600">Readiness</div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${readinessPill(Number(caseItem.readiness_score || 0))}`}>
                  {caseItem.readiness_score}%
                </span>
              </div>
              <div className="justify-self-start">
                <span className={`inline-flex rounded-md border px-2.5 py-1.5 text-xs font-semibold ${action.color === "red" ? "border-red-200 bg-red-50 text-red-700" : action.color === "amber" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-700"}`}>
                  {action.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TrackFitPanel() {
  const items = [
    {
      label: "Track",
      value: "AI Risk Manager",
      detail: "Stops merchant loss from disputes, refunds, and chargebacks.",
    },
    {
      label: "Loss class",
      value: "Evidence readiness loss",
      detail: "Merchant loses because payment, refund, delivery, or complaint proof is scattered.",
    },
    {
      label: "Working system",
      value: "Risk score + proof check + final decision",
      detail: "Scores loss risk, checks proof, drafts response, routes to reviewer.",
    },
    {
      label: "Measured bar",
      value: "Precision, recall, false-positive cost",
      detail: "Model card and ROI metrics are visible in Risk Intelligence.",
    },
  ];

  return (
    <section className="grid gap-3 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-emerald-700">{item.label}</div>
          <div className="mt-2 text-sm font-semibold text-slate-950">{item.value}</div>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">{item.detail}</p>
        </div>
      ))}
    </section>
  );
}

function ProductInfoPanel() {
  return (
    <details className="group rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-slate-900">Product context</span>
          <span className="hidden text-xs font-medium text-slate-600 sm:inline">
            How ProofPilot turns dispute signals into reviewer-approved packets.
          </span>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-200 p-4">
        <p className="mb-4 max-w-4xl text-sm font-medium leading-relaxed text-slate-600">
          ProofPilot shows which dispute can lose money, what proof is missing, and what action is safest. It turns Razorpay payment and dispute signals into reviewer-approved response packets before deadlines are missed.
        </p>
        <TrackFitPanel />
      </div>
    </details>
  );
}

function MerchantWorkflowBanner() {
  return (
    <details className="group rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Merchant workflow</h3>
          <p className="mt-1 text-xs font-medium text-slate-600">Open only when you need the step-by-step flow.</p>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-4 border-t border-slate-200 p-4 md:grid-cols-5">
        <WorkflowStep index={1} icon={Radar} title="See risky case" text="Payment, refund, dispute, and complaint signals are grouped." />
        <WorkflowStep index={2} icon={ShieldCheck} title="Know the risk" text="Model scores chance of merchant loss and explains why." />
        <WorkflowStep index={3} icon={FileCheck2} title="Fix missing proof" text="Required invoice, refund, delivery, or policy proof is checked." />
        <WorkflowStep index={4} icon={Sparkles} title="Review response" text="A concise response draft is prepared from the proof." />
        <WorkflowStep index={5} icon={UserCheck} title="Take decision" text="Reviewer approves, escalates, accepts, exports, and audits." isLast />
      </div>
    </details>
  );
}

function GuardrailsFooter() {
  const items = [
    "Reviewer approval before any external action",
    "Rules control contest, accept, and escalate paths",
    "Evidence-backed packet for every decision",
    "Full audit history for proof, drafts, and decisions",
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Operational controls</h3>
            <p className="mt-0.5 text-xs font-medium text-slate-600">Decision safety is enforced outside the AI layer.</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DataStatusStrip({ dataSource, loading, error, lastSynced, razorpayStatus }) {
  const connected = !loading && !error && dataSource === "secure case store";
  const razorpayConnected = Boolean(razorpayStatus?.configured);
  const sources = [
    { icon: Database, label: "Case store", value: connected ? "Connected" : "Connecting", ok: connected },
    { icon: IndianRupee, label: "Payments", value: razorpayConnected ? "Connected" : "Not connected", ok: razorpayConnected },
    { icon: PackageCheck, label: "Evidence", value: "Fulfillment proof ready", ok: true },
    { icon: MessageSquare, label: "Claims", value: "Complaint parser ready", ok: true },
    { icon: UploadCloud, label: "Webhook", value: razorpayStatus?.webhook_secret_configured ? "Verified" : "Needs setup", ok: Boolean(razorpayStatus?.webhook_secret_configured) },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-2">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${connected ? "bg-emerald-50 text-emerald-700" : loading ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : connected ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          </span>
          <div>
            <div className="text-sm font-semibold text-slate-900">
              {loading ? "Syncing merchant risk workspace" : connected ? "Merchant risk workspace connected" : "Merchant risk workspace ready"}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {error || (lastSynced ? `Last synced ${lastSynced.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "Waiting for first sync")}
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-5 lg:min-w-[720px]">
          {sources.map((source) => {
            const Icon = source.icon;
            return (
              <div key={source.label} className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <Icon className={`h-3.5 w-3.5 ${source.ok ? "text-emerald-600" : "text-amber-600"}`} />
                  {source.label}
                </div>
                <div className="mt-1 truncate text-xs font-medium text-slate-800">{source.value}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OverviewHome({ cases, metrics, onSelectCase, onNavigate, dataSource, loading, error, lastSynced, razorpayStatus }) {

  return (
    <div className="flex min-h-full flex-col gap-4">
      <DataStatusStrip
        dataSource={dataSource}
        loading={loading}
        error={error}
        lastSynced={lastSynced}
        razorpayStatus={razorpayStatus}
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> AI Risk Manager | Dispute Loss Prevention
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">ProofPilot AI</h2>
            <div className="mt-1 text-base font-medium text-slate-700">Actionable risk management and dispute recovery queue.</div>
          </div>
          <button onClick={() => onNavigate("risk-queue")} className="inline-flex w-fit items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
            Open action queue <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <KpiBar metrics={metrics} />

      <ProductInfoPanel />

      <div className="flex flex-1 flex-col">
        <PriorityBoard cases={cases} onSelectCase={onSelectCase} onOpenQueue={() => onNavigate("risk-queue", true)} />
      </div>

      <MerchantWorkflowBanner />
      <GuardrailsFooter />
    </div>
  );
}
function CaseDrawer({ open, caseItem, detail, onClose }) {
  if (!open || !caseItem) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 bg-slate-950/30" onClick={onClose} aria-label="Close case drawer backdrop" />
      <aside className="absolute right-0 top-0 h-full w-full max-w-5xl overflow-y-auto border-l border-slate-200 bg-slate-50 shadow-2xl">
        <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-5">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Selected case</div>
            <div className="mt-0.5 truncate text-sm font-semibold text-slate-950">
              {caseItem.customer_name} | {caseItem.dispute_type.replace(/_/g, " ")} | {caseItem.case_id}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Close selected case"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 md:p-5">{detail}</div>
      </aside>
    </div>
  );
}

function NewCaseModal({ open, onClose, onSubmit }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    dispute_type: "goods_not_received",
    customer_name: "",
    customer_email: "",
    amount: 1299,
    order_id: "",
    payment_id: "",
    dispute_id: "",
    deadline: todayPlus(7),
    team: "Operations",
    owner: "Ops Reviewer",
    available_evidence: [],
    evidence_files: {},
    customer_message: DEFAULT_BY_TYPE.goods_not_received.customer_message,
  }));

  const defaults = DEFAULT_BY_TYPE[form.dispute_type];
  const required = useMemo(() => getRequired(form.dispute_type), [form.dispute_type]);
  const previewScores = useMemo(() => {
    const preview = {
      ...defaults,
      ...form,
      amount: Number(form.amount || 0),
      available_evidence: [],
      missing_evidence: required,
      evidence_files: {},
      payment_id: form.payment_id || "pay_preview",
      order_id: form.order_id || "ord_preview",
      dispute_id: form.dispute_id || "disp_preview",
      timeline_events: [{ event: "payment.captured" }, { event: "proofpilot.case.created" }],
    };
    return scoreCase(preview);
  }, [defaults, form, required]);

  if (!open) return null;

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const changeType = (type) => {
    const nextDefaults = DEFAULT_BY_TYPE[type];
    setForm((prev) => ({
      ...prev,
      dispute_type: type,
      dispute_reason: nextDefaults.dispute_reason,
      customer_message: nextDefaults.customer_message,
      payment_status: nextDefaults.payment_status,
      refund_status: nextDefaults.refund_status,
      delivery_status: nextDefaults.delivery_status,
      available_evidence: [],
      evidence_files: {},
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        ...defaults,
        ...form,
        amount: Number(form.amount),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60]">
      <button className="absolute inset-0 bg-slate-950/40" onClick={onClose} aria-label="Close new case modal" />
      <div className="absolute left-1/2 top-8 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 rounded-lg border border-slate-200 bg-white shadow-2xl">
        <form onSubmit={submit}>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Add dispute risk case</h2>
              <p className="mt-1 text-xs text-slate-500">
                Creates a proof checklist and routes the case into the merchant review queue.
              </p>
            </div>
            <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[72vh] overflow-y-auto p-5 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs font-medium text-slate-600 md:col-span-1">
                Case type
                <select value={form.dispute_type} onChange={(e) => changeType(e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500">
                  {DISPUTE_TYPES.map((type) => (
                    <option key={type} value={type}>{TYPE_LABEL[type]}</option>
                  ))}
                </select>
              </label>
              <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 md:col-span-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Scores are auto-calculated</div>
                <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                  ProofPilot computes risk and confidence from amount, dispute type, statuses, evidence gaps, complaint text, and deadline urgency.
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded bg-white/70 px-2 py-1">
                    <div className="text-emerald-700">Risk</div>
                    <div className="font-semibold text-slate-950">{previewScores.risk_score}</div>
                  </div>
                  <div className="rounded bg-white/70 px-2 py-1">
                    <div className="text-emerald-700">Readiness</div>
                    <div className="font-semibold text-slate-950">{previewScores.readiness_score}%</div>
                  </div>
                  <div className="rounded bg-white/70 px-2 py-1">
                    <div className="text-emerald-700">Confidence</div>
                    <div className="font-semibold text-slate-950">{previewScores.confidence_score}%</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">
                Customer name
                <input required value={form.customer_name} onChange={(e) => setField("customer_name", e.target.value)} placeholder="e.g. Riya Sharma" className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Amount
                <input required type="number" min="1" value={form.amount} onChange={(e) => setField("amount", e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Order ID
                <input value={form.order_id} onChange={(e) => setField("order_id", e.target.value)} placeholder="auto-generated if blank" className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Payment ID
                <input value={form.payment_id} onChange={(e) => setField("payment_id", e.target.value)} placeholder="auto-generated if blank" className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Response due
                <input type="date" value={form.deadline} onChange={(e) => setField("deadline", e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Owner
                <input value={form.owner} onChange={(e) => setField("owner", e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
              </label>
            </div>

            <label className="block text-xs font-medium text-slate-600">
              Customer complaint
              <textarea rows="3" value={form.customer_message} onChange={(e) => setField("customer_message", e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
            </label>

            <div>
              <div className="text-xs font-medium text-slate-600">Required proof after case creation</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {required.map((key) => (
                  <div key={key} className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                    {EVIDENCE_LABELS[key] || key}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlusCircle className="h-3.5 w-3.5" />}
              Add case
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
export default function Dashboard() {
  const { user, logout } = useAuth();
  const [cases, setCases] = useState([]);
  const [active, setActive] = useState("overview");
  const [caseTab, setCaseTab] = useState("evidence-passport");
  const [selectedId, setSelectedId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recentlyAttached, setRecentlyAttached] = useState([]);
  const [attachments, setAttachments] = useState({});
  const [casePanelOpen, setCasePanelOpen] = useState(false);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [dataSource, setDataSource] = useState("secure case store");
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [lastSynced, setLastSynced] = useState(null);
  const [razorpayStatus, setRazorpayStatus] = useState(null);
  const [backendMetrics, setBackendMetrics] = useState(() => calculateProofPilotMetrics([]));

  const refreshMetrics = async (fallbackCases = cases) => {
    try {
      const nextMetrics = await fetchBackendMetrics(fallbackCases);
      setBackendMetrics(nextMetrics);
      return nextMetrics;
    } catch {
      const fallbackMetrics = calculateProofPilotMetrics(fallbackCases);
      setBackendMetrics(fallbackMetrics);
      return fallbackMetrics;
    }
  };

  const loadCasesFromBackend = async () => {
    setDataLoading(true);
    setDataError("");
    try {
      const res = await apiFetch("/api/cases");
      if (!res.ok) throw new Error("Service connection unavailable");
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new Error("Unexpected case response");
      const normalized = rows.map((item) => ({ ...item, id: item.id || item.case_id }));
      setCases(normalized);
      setSelectedId((current) => current || normalized[0]?.id || normalized[0]?.case_id || null);
      setDataSource("secure case store");
      setLastSynced(new Date());
      await refreshMetrics(normalized);
      return normalized;
    } catch (error) {
      setCases([]);
      setSelectedId(null);
      setDataSource("secure case store");
      setDataError("Service connection is unavailable. Cases will appear after the connection is restored.");
      await refreshMetrics([]);
      throw error;
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    loadCasesFromBackend().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/integrations/razorpay/status")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Razorpay status unavailable"))))
      .then((status) => {
        if (!cancelled) setRazorpayStatus(status);
      })
      .catch(() => {
        if (!cancelled) setRazorpayStatus({ configured: false, webhook_secret_configured: false, mode: "unknown" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setRecentlyAttached([]);
  }, [selectedId]);

  const selected = cases.find((c) => c.id === selectedId || c.case_id === selectedId) || cases[0];

  const navigate = (section, openCase = false) => {
    if (CASE_SECTIONS.includes(section)) {
      setActive("risk-queue");
      setCaseTab(section);
      setCasePanelOpen(true);
      return;
    }
    setActive(section);
    if (section === "risk-queue" && openCase) {
      setCasePanelOpen(true);
    }
    if (section !== "risk-queue") {
      setCasePanelOpen(false);
    }
  };

  const selectCase = (id) => {
    setSelectedId(id);
    setCaseTab("evidence-passport");
    if (active === "risk-queue") {
      setCasePanelOpen(true);
    }
  };

  const updateCase = (id, patch) => {
    setCases((prev) => prev.map((c) => (c.id === id || c.case_id === id ? { ...c, ...patch } : c)));
  };

  const replaceCase = (nextCase) => {
    setCases((prev) => prev.map((c) => (c.id === nextCase.id || c.case_id === nextCase.case_id ? nextCase : c)));
  };

  const handleAttach = async (evidenceKey, uploadPayload = {}) => {
    if (!selected) return;
    const fileName = uploadPayload.fileName || uploadPayload.file_name || "";
    const uploadedFile = fileName ? {
      file_name: fileName,
      mime_type: uploadPayload.mimeType,
      size_bytes: uploadPayload.size,
      uploaded_at: new Date().toISOString(),
      storage_status: "Syncing",
    } : null;
    const evidenceFiles = uploadedFile
      ? { ...(selected.evidence_files || {}), [evidenceKey]: uploadedFile }
      : selected.evidence_files || {};
    const available = [...new Set([...(selected.available_evidence || []), evidenceKey])];
    const missing = (selected.missing_evidence || []).filter((e) => e !== evidenceKey);
    const scores = scoreCase({ ...selected, available_evidence: available, missing_evidence: missing, evidence_files: evidenceFiles });
    const audit = {
      timestamp: new Date().toISOString(),
      actor: "Evidence Radar",
      action: "evidence_attached",
      detail: `Attached: ${evidenceKey}${fileName ? ` (${fileName})` : ""} | readiness ${scores.readiness_score}%`,
    };
    const patch = {
      available_evidence: available,
      missing_evidence: missing,
      ...scores,
      audit_log: [...(selected.audit_log || []), audit],
    };
    if (uploadedFile) {
      setAttachments((prev) => ({
        ...prev,
        [selected.id]: {
          ...(prev[selected.id] || {}),
          [evidenceKey]: uploadedFile,
        },
      }));
    }
    setRecentlyAttached((prev) => [...prev, evidenceKey]);
    updateCase(selected.id, patch);

    try {
      const res = await apiFetch(`/api/cases/${selected.id}/evidence`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidenceKey,
          fileName,
          mimeType: uploadPayload.mimeType,
          size: uploadPayload.size,
          contentBase64: uploadPayload.contentBase64,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Evidence upload failed");
      }
      const nextCase = await res.json();
      replaceCase(nextCase);
      await refreshMetrics();
    } catch {
      setDataError("Evidence upload could not be saved. Please retry after the backend connection is restored.");
    }
  };

  const handleRemoveEvidence = async (evidenceKey) => {
    if (!selected) return;
    const confirmed = window.confirm(`Remove ${EVIDENCE_LABELS[evidenceKey] || evidenceKey} from this case?`);
    if (!confirmed) return;

    const available = (selected.available_evidence || []).filter((item) => item !== evidenceKey);
    const required = getRequired(selected.dispute_type);
    const missing = required.includes(evidenceKey)
      ? [...new Set([...(selected.missing_evidence || []), evidenceKey])]
      : selected.missing_evidence || [];
    const evidenceFiles = { ...(selected.evidence_files || {}) };
    delete evidenceFiles[evidenceKey];
    const scores = scoreCase({ ...selected, available_evidence: available, missing_evidence: missing, evidence_files: evidenceFiles });
    updateCase(selected.id, {
      available_evidence: available,
      missing_evidence: missing,
      evidence_files: evidenceFiles,
      ...scores,
    });
    setAttachments((prev) => {
      const nextCaseAttachments = { ...(prev[selected.id] || {}) };
      delete nextCaseAttachments[evidenceKey];
      return {
        ...prev,
        [selected.id]: nextCaseAttachments,
      };
    });
    setRecentlyAttached((prev) => prev.filter((item) => item !== evidenceKey));

    try {
      const res = await apiFetch(`/api/cases/${selected.id}/evidence/${encodeURIComponent(evidenceKey)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Evidence removal failed");
      }
      const nextCase = await res.json();
      replaceCase(nextCase);
      await refreshMetrics();
    } catch {
      setDataError("Evidence could not be removed. Please refresh and try again.");
    }
  };

  const addAudit = (action, detail) => {
    if (!selected) return [];
    return [
      ...(selected.audit_log || []),
      { timestamp: new Date().toISOString(), actor: "Human Reviewer", action, detail },
    ];
  };

  const handleDecision = async (status, actionLabel, reason = "") => {
    if (!selected) return;
    const detail = reason.trim() ? `Packet ${status} for ${selected.order_id}: ${reason.trim()}` : `Packet ${status} for ${selected.order_id}`;
    const auditLog = addAudit(actionLabel, detail);
    updateCase(selected.id, { packet_status: status, audit_log: auditLog });
    try {
      const res = await apiFetch(`/api/cases/${selected.id}/decision`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason }),
      });
      if (res.ok) {
        const nextCase = await res.json();
        replaceCase(nextCase);
        await refreshMetrics();
      }
    } catch {
      setDataError("Decision could not be saved. Please retry after the backend connection is restored.");
    }
  };

  const handleEditDraft = async (newDraft) => {
    if (!selected) return;
    const auditLog = addAudit("edited", "Merchant response draft edited by human");
    updateCase(selected.id, { merchant_response_draft: newDraft, audit_log: auditLog });
    try {
      const res = await apiFetch(`/api/cases/${selected.id}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: newDraft }),
      });
      if (res.ok) {
        const nextCase = await res.json();
        replaceCase(nextCase);
        await refreshMetrics();
      }
    } catch {
      setDataSource("secure case store");
      setDataError("Draft could not be saved. Please retry after the backend connection is restored.");
    }
  };

  const handleExportPacket = async () => {
    if (!selected) return;
    const auditLog = addAudit("packet_exported", `Exported response packet for ${selected.order_id}`);
    updateCase(selected.id, { audit_log: auditLog });
    try {
      const res = await apiFetch(`/api/cases/${selected.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const nextCase = await res.json();
        replaceCase(nextCase);
        await refreshMetrics();
      }
    } catch {
      setDataError("Packet export could not be saved. Please retry after the backend connection is restored.");
    }
  };

  const handleSubmitToRazorpay = async () => {
    if (!selected || selected.packet_status !== "approved") return;
    try {
      const res = await apiFetch(`/api/cases/${selected.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "contest" }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Razorpay submission failed");
      replaceCase(payload.case);
      await refreshMetrics();
    } catch (error) {
      setDataError(error.message || "Razorpay submission failed");
    }
  };

  const handleDeleteCase = async () => {
    if (!selected || !isManualCase(selected)) return;
    const confirmed = window.confirm(`Delete ${selected.case_id}? This removes the case, evidence, timeline, and audit records.`);
    if (!confirmed) return;

    try {
      const res = await apiFetch(`/api/cases/${selected.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setCases((prev) => {
        const nextCases = prev.filter((item) => item.id !== selected.id && item.case_id !== selected.case_id);
        setSelectedId(nextCases[0]?.id || nextCases[0]?.case_id || null);
        return nextCases;
      });
      setAttachments((prev) => {
        const next = { ...prev };
        delete next[selected.id];
        delete next[selected.case_id];
        return next;
      });
      setCasePanelOpen(false);
      setDataSource("secure case store");
      setLastSynced(new Date());
      await refreshMetrics();
    } catch {
      setDataError("Could not delete case. Please refresh and try again.");
    }
  };

  const handleCreateCase = async (input) => {
    try {
      const res = await apiFetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Service connection unavailable");
      const created = await res.json();
      setCases((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setActive("risk-queue");
      setCasePanelOpen(true);
      setDataSource("secure case store");
      await refreshMetrics();
    } catch {
      setDataError("Case could not be created. Please check the backend connection and try again.");
    }
  };

  const detail = selected ? (
    <CaseDetail
      caseItem={selected}
      activeTab={caseTab}
      onTabChange={setCaseTab}
      onAttach={handleAttach}
      onRemoveEvidence={handleRemoveEvidence}
      recentlyAttached={recentlyAttached}
      attachments={{ ...(selected.evidence_files || {}), ...(attachments[selected.id] || {}) }}
      onApprove={(reason) => handleDecision("approved", "approved", reason)}
      onEscalate={(reason) => handleDecision("escalated", "escalated", reason)}
      onAccept={(reason) => handleDecision("accepted", "accepted", reason)}
      onSubmit={handleSubmitToRazorpay}
      onEditDraft={handleEditDraft}
      onExportPacket={handleExportPacket}
      onDelete={handleDeleteCase}
    />
  ) : null;

  const queuePage = active === "risk-queue";

  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex">
      <Sidebar active={active} onSelect={navigate} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-slate-600" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h1 className="text-sm font-semibold text-slate-900">{PAGE_TITLES[active] || active.replace(/-/g, " ")}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-xs font-medium text-slate-500 sm:block">
              Merchant Risk Workspace
            </div>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
                {user?.name ? user.name.trim().charAt(0).toUpperCase() : "M"}
              </span>
              Log out
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-x-hidden overflow-y-auto">
          {active === "overview" ? (
            <OverviewHome
              cases={cases}
              metrics={backendMetrics}
              onSelectCase={setSelectedId}
              onNavigate={navigate}
              dataSource={dataSource}
              loading={dataLoading}
              error={dataError}
              lastSynced={lastSynced}
              razorpayStatus={razorpayStatus}
            />
          ) : active === "metrics" ? (
            <MetricsDashboard cases={cases} metrics={backendMetrics} />
          ) : active === "reliability" ? (
            <ReliabilityDashboard />
          ) : active === "audit-log" ? (
            <AuditLogView cases={cases} />
          ) : queuePage ? (
            <div className="space-y-4">
              <QueueInsight onCreateCase={() => setNewCaseOpen(true)} />
              <SummaryCards cases={cases} metrics={backendMetrics} />
              <RiskQueue cases={cases} selectedId={selected?.id} onSelect={selectCase} onCreateCase={() => setNewCaseOpen(true)} />
            </div>
          ) : null}
        </main>
      </div>
      <CaseDrawer open={queuePage && casePanelOpen} caseItem={selected} detail={detail} onClose={() => setCasePanelOpen(false)} />
      <NewCaseModal open={newCaseOpen} onClose={() => setNewCaseOpen(false)} onSubmit={handleCreateCase} />
    </div>
  );
}
