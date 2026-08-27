import React from "react";
import { CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS = {
  ok: { icon: CheckCircle2, color: "text-emerald-500", dot: "bg-emerald-500" },
  warn: { icon: AlertTriangle, color: "text-amber-500", dot: "bg-amber-500" },
  alert: { icon: AlertCircle, color: "text-red-500", dot: "bg-red-500" },
};

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function PaymentTimeline({ caseItem }) {
  if (!caseItem) return null;
  const events = caseItem.timeline_events || [];
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Payment Incident Timeline</h3>
      <ol className="relative border-l border-slate-200 ml-3 space-y-4">
        {events.map((ev, i) => {
          const s = STATUS[ev.status] || STATUS.ok;
          const Icon = s.icon;
          return (
            <li key={i} className="ml-5">
              <span className={cn("absolute -left-[9px] w-4 h-4 rounded-full ring-4 ring-white flex items-center justify-center", s.dot)}>
                <Icon className="w-2.5 h-2.5 text-white" />
              </span>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5">
                <span className="text-sm font-medium text-slate-800">{ev.event}</span>
                <span className="text-[11px] text-slate-400 font-mono">{formatDate(ev.timestamp)}</span>
              </div>
              {ev.detail && <p className="text-xs text-slate-500 mt-0.5">{ev.detail}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
