import React from "react";
import { Target, ClipboardCheck, AlertOctagon, Clock, ShieldCheck, IndianRupee, TrendingUp, Scale, BrainCircuit } from "lucide-react";
import AnimatedValue from "./AnimatedValue";
import { calculateProofPilotMetrics, formatMoney, REVIEW_COST_PER_CASE, TIME_SAVED_MIN_PER_CASE } from "@/lib/metrics";
import { MODEL_CARD } from "@/lib/mlRiskModel";

const toneClasses = {
  red: "text-red-600 bg-red-50",
  amber: "text-amber-600 bg-amber-50",
  emerald: "text-emerald-600 bg-emerald-50",
  blue: "text-blue-600 bg-blue-50",
};

function MetricCard({ icon: Icon, label, value, tone, hint, formula }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        <span className={`w-8 h-8 rounded-md flex items-center justify-center ${toneClasses[tone]}`}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <AnimatedValue value={value} className="mt-2 block text-2xl font-semibold text-slate-900 tabular-nums" />
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
      {formula && <div className="mt-2 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-500">{formula}</div>}
    </div>
  );
}

function Row({ label, value, hint }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <div>
        <div className="text-sm text-slate-700">{label}</div>
        {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
      </div>
      <AnimatedValue value={value} className="text-sm font-medium text-slate-900 tabular-nums whitespace-nowrap" />
    </div>
  );
}

function percent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

export default function MetricsDashboard({ cases = [] }) {
  const metrics = calculateProofPilotMetrics(cases);
  const validation = MODEL_CARD.validation || {};
  const cards = [
    {
      label: "Loss Risk",
      value: metrics.averageRisk,
      icon: Target,
      tone: metrics.averageRisk >= 75 ? "red" : "amber",
      hint: `${metrics.highRiskCases} high-risk cases`,
      formula: "mean(model probability + guardrails)",
    },
    {
      label: "Proof Readiness",
      value: `${metrics.averageReadiness}%`,
      icon: ClipboardCheck,
      tone: metrics.averageReadiness >= 80 ? "emerald" : "amber",
      hint: `${metrics.evidenceReadyCases}/${metrics.totalCases} ready`,
      formula: "required proofs present / required proofs",
    },
    {
      label: "Decision Confidence",
      value: `${metrics.averageConfidence}%`,
      icon: ShieldCheck,
      tone: metrics.averageConfidence >= 80 ? "emerald" : "blue",
      hint: "evidence, IDs, timeline, rule match",
      formula: "evidence coverage + signal completeness",
    },
    {
      label: "Human Queue",
      value: metrics.awaitingApprovalCases,
      icon: AlertOctagon,
      tone: metrics.awaitingApprovalCases ? "amber" : "emerald",
      hint: "draft packets awaiting action",
      formula: "packet_status = draft",
    },
    {
      label: "Ops Time Saved",
      value: `${metrics.reviewMinutesSaved} min`,
      icon: Clock,
      tone: "blue",
      hint: `${TIME_SAVED_MIN_PER_CASE} min per case estimate`,
      formula: `${metrics.totalCases} cases x ${TIME_SAVED_MIN_PER_CASE} min`,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Metrics Dashboard</h2>
        <p className="text-sm text-slate-500">Live case metrics calculated from the current ProofPilot queue.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900">Risk Model Card</h3>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {MODEL_CARD.name} uses {MODEL_CARD.type} to estimate dispute-loss probability before rule guardrails choose contest, accept, or escalate.
            </p>
            <p className="mt-2 text-[11px] text-slate-400">{MODEL_CARD.production_note}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 min-w-full lg:min-w-[520px]">
            <div className="rounded-md bg-slate-50 border border-slate-100 p-2">
              <div className="text-[10px] uppercase text-slate-400">Precision</div>
              <AnimatedValue value={percent(validation.precision)} className="text-sm font-semibold text-slate-900 tabular-nums" />
            </div>
            <div className="rounded-md bg-slate-50 border border-slate-100 p-2">
              <div className="text-[10px] uppercase text-slate-400">Recall</div>
              <AnimatedValue value={percent(validation.recall)} className="text-sm font-semibold text-slate-900 tabular-nums" />
            </div>
            <div className="rounded-md bg-slate-50 border border-slate-100 p-2">
              <div className="text-[10px] uppercase text-slate-400">F1</div>
              <AnimatedValue value={percent(validation.f1)} className="text-sm font-semibold text-slate-900 tabular-nums" />
            </div>
            <div className="rounded-md bg-slate-50 border border-slate-100 p-2">
              <div className="text-[10px] uppercase text-slate-400">Accuracy</div>
              <AnimatedValue value={percent(validation.accuracy)} className="text-sm font-semibold text-slate-900 tabular-nums" />
            </div>
            <div className="rounded-md bg-slate-50 border border-slate-100 p-2">
              <div className="text-[10px] uppercase text-slate-400">Holdout</div>
              <AnimatedValue value={validation.holdout_rows || 0} className="text-sm font-semibold text-slate-900 tabular-nums" />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(MODEL_CARD.features || []).map((feature) => (
            <span key={feature} className="rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
              {feature}
            </span>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Scale className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">ROI Calculation</h3>
          </div>
          <Row label="Total flagged cases" value={metrics.totalCases} />
          <Row label="Open value at risk" value={formatMoney(metrics.valueAtRisk)} hint="draft + escalated cases" />
          <Row label="Average dispute value" value={formatMoney(metrics.averageDisputeValue)} />
          <Row label="Contest-ready draft cases" value={metrics.contestReadyCases} hint="readiness >= 80 and action = contest" />
          <Row label="Approved contest cases" value={metrics.approvedContestCases} hint="human approved contest packet" />
          <Row label="False-positive review count" value={metrics.falsePositiveReviewCount} hint="high risk but not contest recommendation" />
          <Row label="Review cost / case" value={formatMoney(REVIEW_COST_PER_CASE)} />
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-900">Net Merchant Benefit</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-md bg-emerald-50 border border-emerald-100 p-3">
              <span className="inline-flex items-center gap-2 text-sm text-emerald-800">
                <ShieldCheck className="w-4 h-4" /> Approved prevented loss
              </span>
              <AnimatedValue value={formatMoney(metrics.preventedLoss)} className="text-lg font-semibold text-emerald-700 tabular-nums" />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md bg-blue-50 border border-blue-100 p-3">
              <span className="inline-flex items-center gap-2 text-sm text-blue-800">
                <IndianRupee className="w-4 h-4" /> Recoverable ready value
              </span>
              <AnimatedValue value={formatMoney(metrics.recoverableValue)} className="text-lg font-semibold text-blue-700 tabular-nums" />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md bg-amber-50 border border-amber-100 p-3">
              <span className="inline-flex items-center gap-2 text-sm text-amber-800">
                <AlertOctagon className="w-4 h-4" /> Review operating cost
              </span>
              <AnimatedValue value={formatMoney(metrics.reviewCost)} className="text-lg font-semibold text-amber-700 tabular-nums" />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md bg-slate-900 p-3">
              <span className="inline-flex items-center gap-2 text-sm text-white">
                <TrendingUp className="w-4 h-4" /> Net benefit
              </span>
              <AnimatedValue value={formatMoney(metrics.netBenefit)} className="text-lg font-semibold text-white tabular-nums" />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            Net benefit = approved prevented loss + contest-ready value - review cost.
          </p>
        </div>
      </div>
    </div>
  );
}
