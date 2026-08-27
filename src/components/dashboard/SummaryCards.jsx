import React from "react";
import { ShieldAlert, CheckCircle2, Clock, IndianRupee } from "lucide-react";
import AnimatedValue from "./AnimatedValue";
import { calculateProofPilotMetrics, formatMoney } from "@/lib/metrics";

function Card({ icon: Icon, label, value, sub, tone }) {
  const tones = {
    red: "text-red-600 bg-red-50",
    amber: "text-amber-600 bg-amber-50",
    emerald: "text-emerald-600 bg-emerald-50",
    blue: "text-blue-600 bg-blue-50",
  };
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        <span className={`w-8 h-8 rounded-md flex items-center justify-center ${tones[tone]}`}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <AnimatedValue value={value} className="mt-2 block text-2xl font-semibold text-slate-900 tabular-nums" />
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export default function SummaryCards({ cases }) {
  const metrics = calculateProofPilotMetrics(cases);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card icon={ShieldAlert} label="Total Cases" value={metrics.totalCases} sub={`${metrics.openCases} open | ${metrics.highRiskCases} high risk`} tone="red" />
      <Card icon={CheckCircle2} label="Evidence Ready" value={metrics.evidenceReadyCases} sub={`${metrics.totalCases - metrics.evidenceReadyCases} need attention`} tone="emerald" />
      <Card icon={Clock} label="Awaiting Approval" value={metrics.awaitingApprovalCases} sub="human review required" tone="amber" />
      <Card icon={IndianRupee} label="Value at Risk" value={formatMoney(metrics.valueAtRisk)} sub="draft + escalated packets" tone="blue" />
    </div>
  );
}
