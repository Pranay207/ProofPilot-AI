import React from "react";
import { PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { riskTone, readinessTone, actionTone } from "@/lib/ruleEngine";

const toneClasses = {
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  emerald: "bg-emerald-100 text-emerald-700",
  blue: "bg-blue-100 text-blue-700",
};

function Badge({ tone, label }) {
  return <span className={cn("inline-flex items-center px-2 py-1 rounded text-[11px] font-semibold whitespace-nowrap", toneClasses[tone])}>{label}</span>;
}

const TYPE_LABEL = {
  goods_not_received: "Goods not received",
  refund_not_processed: "Refund not processed",
  duplicate_payment: "Duplicate payment",
  unauthorized_transaction: "Unauthorized transaction",
  product_not_as_described: "Product not as described",
  cancelled_subscription: "Cancelled subscription charged",
};

function formatMoney(value) {
  return `INR ${Number(value || 0).toLocaleString("en-IN")}`;
}

export default function RiskQueue({ cases, selectedId, onSelect, onCreateCase }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Risk Queue</h2>
          <p className="text-xs text-slate-500">{cases.length} flagged transactions ranked by loss and evidence readiness.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden text-xs text-slate-500 sm:block">Click a row to open the workflow.</div>
          <button onClick={onCreateCase} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
            <PlusCircle className="h-3.5 w-3.5" />
            New case
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="text-left font-medium px-3 py-3 w-[170px]">Case type</th>
              <th className="text-left font-medium px-3 py-3 w-[150px]">Customer</th>
              <th className="text-left font-medium px-3 py-3">Order ID</th>
              <th className="text-left font-medium px-3 py-3">Payment ID</th>
              <th className="text-right font-medium px-3 py-3 w-[110px]">Amount</th>
              <th className="text-center font-medium px-3 py-3 w-[88px]">Risk</th>
              <th className="text-center font-medium px-3 py-3 w-[104px]">Readiness</th>
              <th className="text-left font-medium px-3 py-3 w-[116px]">Deadline</th>
              <th className="text-left font-medium px-3 py-3 w-[140px]">Action</th>
              <th className="text-left font-medium px-3 py-3 w-[110px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {!cases.length && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center">
                  <div className="mx-auto max-w-sm">
                    <div className="text-sm font-semibold text-slate-900">No risk cases in the queue</div>
                    <p className="mt-1 text-xs text-slate-500">Create a case to generate an evidence passport, score risk, and prepare a human-approved response packet.</p>
                    <button onClick={onCreateCase} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                      <PlusCircle className="h-3.5 w-3.5" />
                      New case
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {cases.map((c) => {
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
                    <div className="font-medium text-slate-900 leading-snug">{TYPE_LABEL[c.dispute_type] || c.dispute_type?.replace(/_/g, " ")}</div>
                    <div className="text-[11px] text-slate-500 mt-1 truncate">{c.dispute_reason}</div>
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
                  <td className="px-3 py-3 text-right align-middle font-semibold text-slate-900 tabular-nums">{formatMoney(c.amount)}</td>
                  <td className="px-3 py-3 text-center align-middle"><Badge tone={risk.color} label={`${c.risk_score}`} /></td>
                  <td className="px-3 py-3 text-center align-middle"><Badge tone={ready.color} label={`${c.readiness_score}%`} /></td>
                  <td className="px-3 py-3 align-middle text-[12px] text-slate-600 whitespace-nowrap">{c.deadline}</td>
                  <td className="px-3 py-3 align-middle"><Badge tone={act.color} label={act.label} /></td>
                  <td className="px-3 py-3 align-middle"><Badge tone="blue" label={c.packet_status || "draft"} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
