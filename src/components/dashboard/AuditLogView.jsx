import React from "react";
import { Bot, Cog, Download, Radar, UserCheck, FileCheck, AlertTriangle, XCircle } from "lucide-react";

const ACTION_ICON = {
  classified: { icon: Bot, color: "text-blue-600" },
  recommended: { icon: Cog, color: "text-slate-600" },
  missing: { icon: Radar, color: "text-red-600" },
  complete: { icon: Radar, color: "text-emerald-600" },
  human_approval_required: { icon: UserCheck, color: "text-amber-600" },
  approved: { icon: FileCheck, color: "text-emerald-600" },
  escalated: { icon: AlertTriangle, color: "text-red-600" },
  accepted: { icon: XCircle, color: "text-amber-600" },
  edited: { icon: FileCheck, color: "text-blue-600" },
  evidence_attached: { icon: Radar, color: "text-blue-600" },
  packet_exported: { icon: Download, color: "text-blue-600" },
};

function formatTs(iso) {
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function AuditLogView({ cases }) {
  const rows = [];
  cases.forEach((c) => {
    (c.audit_log || []).forEach((e) => {
      rows.push({ ...e, case_ref: c.order_id, dispute_type: c.dispute_type });
    });
  });
  rows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">Audit Log</h2>
        <p className="text-xs text-slate-500">Every AI classification, rule recommendation, evidence check, and human decision is recorded.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="text-left font-medium px-3 py-2">Time</th>
              <th className="text-left font-medium px-3 py-2">Actor</th>
              <th className="text-left font-medium px-3 py-2">Action</th>
              <th className="text-left font-medium px-3 py-2">Detail</th>
              <th className="text-left font-medium px-3 py-2">Case</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <div className="text-sm font-semibold text-slate-900">No audit events yet</div>
                  <p className="mt-1 text-xs text-slate-500">Evidence attachments, draft edits, packet exports, and human decisions will appear here.</p>
                </td>
              </tr>
            )}
            {rows.map((e, i) => {
              const cfg = ACTION_ICON[e.action] || { icon: Bot, color: "text-slate-500" };
              const Icon = cfg.icon;
              return (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-[11px] text-slate-400 font-mono whitespace-nowrap">{formatTs(e.timestamp)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
                      <Icon className="w-3.5 h-3.5" /> {e.actor}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-700 capitalize">{e.action.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{e.detail}</td>
                  <td className="px-3 py-2 text-[11px] font-mono text-slate-500">{e.case_ref}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
