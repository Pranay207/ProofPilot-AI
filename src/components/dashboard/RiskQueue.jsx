import React, { useMemo, useState } from "react";
import { PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { riskTone, readinessTone, actionTone } from "@/lib/ruleEngine";

const ACTIVE_STATUSES = new Set(["draft", "escalated"]);
const DECIDED_STATUSES = new Set(["approved", "accepted"]);
const CLOSED_STATUSES = new Set(["contested", "closed"]);

const QUEUE_TABS = [
  { id: "open", label: "Open" },
  { id: "proof-ready", label: "Proof Ready" },
  { id: "escalated", label: "Escalated" },
  { id: "decided", label: "Decided" },
  { id: "closed", label: "Closed" },
];

const toneClasses = {
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  emerald: "bg-emerald-100 text-emerald-700",
  blue: "bg-blue-100 text-blue-700",
};

function Badge({ tone, label }) {
  return <span className={cn("inline-flex items-center px-2 py-1 rounded text-[11px] font-semibold whitespace-nowrap", toneClasses[tone])}>{label}</span>;
}

function formatRazorpayAmount(caseItem) {
  return `${Number(caseItem.amount || 0).toLocaleString("en-IN")} ${caseItem.currency || "INR"}`;
}

function daysUntil(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function RespondByBadge({ value }) {
  const days = daysUntil(value);
  const urgent = days !== null && days <= 2;
  const label = days === null ? value : days < 0 ? "Overdue" : days === 0 ? "Today" : `${days}d left`;
  return (
    <div className="space-y-1">
      <div className="font-mono text-[12px] text-slate-700">{value || "-"}</div>
      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", urgent ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700")}>
        {label}
      </span>
    </div>
  );
}

function matchesTab(caseItem, tab) {
  const status = caseItem.packet_status || "draft";
  if (tab === "proof-ready") return status === "draft" && Number(caseItem.readiness_score || 0) >= 80;
  if (tab === "escalated") return status === "escalated";
  if (tab === "decided") return DECIDED_STATUSES.has(status);
  if (tab === "closed") return CLOSED_STATUSES.has(status);
  return ACTIVE_STATUSES.has(status);
}

function emptyCopy(tab) {
  if (tab === "proof-ready") return "No proof-ready cases yet";
  if (tab === "escalated") return "No escalated cases";
  if (tab === "decided") return "No decided cases";
  if (tab === "closed") return "No closed cases";
  return "No dispute cases need action";
}

export default function RiskQueue({ cases, selectedId, onSelect, onCreateCase }) {
  const [tab, setTab] = useState("open");
  const counts = useMemo(() => {
    return QUEUE_TABS.reduce((acc, item) => {
      acc[item.id] = cases.filter((caseItem) => matchesTab(caseItem, item.id)).length;
      return acc;
    }, {});
  }, [cases]);
  const visibleCases = useMemo(() => cases.filter((caseItem) => matchesTab(caseItem, tab)), [cases, tab]);

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Action Queue</h2>
          <p className="text-xs text-slate-500">{counts.open} open dispute cases ranked by merchant loss risk, missing proof, and deadline.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden text-xs text-slate-500 sm:block">Open a case to see what happened, what is missing, and what to do next.</div>
          <button onClick={onCreateCase} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
            <PlusCircle className="h-3.5 w-3.5" />
            New case
          </button>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2">
        {QUEUE_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === item.id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {item.label}
            <span className={cn("rounded px-1.5 py-0.5 text-[10px]", tab === item.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>
              {counts[item.id] || 0}
            </span>
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="text-left font-medium px-3 py-3 w-[170px]">reason_code</th>
              <th className="text-left font-medium px-3 py-3 w-[150px]">Customer</th>
              <th className="text-left font-medium px-3 py-3">Order ID</th>
              <th className="text-left font-medium px-3 py-3">payment_id</th>
              <th className="text-right font-medium px-3 py-3 w-[120px]">amount</th>
              <th className="text-center font-medium px-3 py-3 w-[88px]">Risk</th>
              <th className="text-center font-medium px-3 py-3 w-[104px]">Readiness</th>
              <th className="text-left font-medium px-3 py-3 w-[128px]">respond_by</th>
              <th className="text-left font-medium px-3 py-3 w-[140px]">Action</th>
              <th className="text-left font-medium px-3 py-3 w-[110px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {!visibleCases.length && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center">
                  <div className="mx-auto max-w-sm">
                    <div className="text-sm font-semibold text-slate-900">{emptyCopy(tab)}</div>
                    <p className="mt-1 text-xs text-slate-500">Create a case to score risk, check proof, and prepare a reviewer-approved response.</p>
                    <button onClick={onCreateCase} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                      <PlusCircle className="h-3.5 w-3.5" />
                      New case
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {visibleCases.map((c) => {
              const risk = riskTone(c.risk_score);
              const ready = readinessTone(c.readiness_score);
              const act = actionTone(c.recommended_action);
              const isSelected = c.id === selectedId;
              return (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "border-t border-slate-100 cursor-pointer transition-colors",
                    isSelected ? "bg-blue-50 ring-1 ring-inset ring-blue-200" : "hover:bg-slate-50"
                  )}
                >
                  <td className="px-3 py-3 align-middle">
                    <div className="font-mono text-[12px] font-semibold text-slate-900 leading-snug">{c.reason_code || c.dispute_type}</div>
                    <div className="text-[11px] text-slate-500 mt-1 truncate">{c.reason_description || c.dispute_reason}</div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="font-medium text-slate-800 truncate">{c.customer_name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{c.team}</div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="font-mono text-[12px] text-slate-700 max-w-[180px] truncate" title={c.order_id}>{c.order_id}</div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="font-mono text-[12px] text-slate-500 max-w-[170px] truncate" title={c.payment_id}>{c.payment_id}</div>
                  </td>
                  <td className="px-3 py-3 text-right align-middle font-semibold text-slate-900 tabular-nums">{formatRazorpayAmount(c)}</td>
                  <td className="px-3 py-3 text-center align-middle"><Badge tone={risk.color} label={`${c.risk_score}`} /></td>
                  <td className="px-3 py-3 text-center align-middle"><Badge tone={ready.color} label={`${c.readiness_score}%`} /></td>
                  <td className="px-3 py-3 align-middle text-[12px] text-slate-600 whitespace-nowrap"><RespondByBadge value={c.respond_by || c.deadline} /></td>
                  <td className="px-3 py-3 align-middle"><Badge tone={act.color} label={act.label} /></td>
                  <td className="px-3 py-3 align-middle"><Badge tone="blue" label={c.status || "open"} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
