import React from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, ClipboardCheck, FileText, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS = {
  ok: { icon: CheckCircle2, color: "text-emerald-500", dot: "bg-emerald-500" },
  warn: { icon: AlertTriangle, color: "text-amber-500", dot: "bg-amber-500" },
  alert: { icon: AlertCircle, color: "text-red-500", dot: "bg-red-500" },
  audit: { icon: UserCheck, color: "text-blue-500", dot: "bg-blue-500" },
  evidence: { icon: ClipboardCheck, color: "text-emerald-500", dot: "bg-emerald-500" },
  draft: { icon: FileText, color: "text-slate-500", dot: "bg-slate-500" },
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
  const timelineEvents = (caseItem.timeline_events || []).map((event) => ({
    event: event.event,
    timestamp: event.timestamp,
    status: event.status || "ok",
    detail: event.detail,
  }));
  const auditEvents = (caseItem.audit_log || []).map((event) => ({
    event: event.action?.replace(/_/g, " ") || "Audit event",
    timestamp: event.timestamp,
    status: event.action === "evidence_attached" ? "evidence" : event.action === "edited" ? "draft" : "audit",
    detail: `${event.actor}: ${event.detail}`,
  }));
  const events = [...timelineEvents, ...auditEvents]
    .filter((event) => event.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Case Timeline</h3>
        <p className="mt-1 text-xs text-slate-500">Payment signals, proof changes, draft edits, and reviewer decisions in order.</p>
      </div>
      <ol className="relative border-l border-slate-200 ml-3 space-y-4">
        {!events.length && (
          <li className="ml-5 text-sm text-slate-500">No timeline events recorded yet.</li>
        )}
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
