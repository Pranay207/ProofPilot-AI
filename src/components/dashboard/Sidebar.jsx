import React from "react";
import { ShieldCheck, ListChecks, BarChart3, ScrollText, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { id: "overview", label: "Overview", icon: ShieldCheck },
  { id: "risk-queue", label: "Risk Queue", icon: ListChecks },
  { id: "metrics", label: "Metrics Dashboard", icon: BarChart3 },
  { id: "audit-log", label: "Audit Log", icon: ScrollText },
];

export default function Sidebar({ active, onSelect, open, onClose }) {
  return (
    <>
      {open && <div className="fixed inset-0 bg-slate-900/40 z-30 md:hidden" onClick={onClose} />}
      <aside
        className={cn(
          "fixed md:sticky z-40 top-0 left-0 h-full md:h-screen w-64 shrink-0 bg-slate-900 text-slate-200 flex flex-col transition-transform",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-emerald-500 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-slate-900" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-white">ProofPilot AI</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Risk Manager</div>
            </div>
          </div>
          <button className="md:hidden text-slate-400" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelect(item.id);
                  onClose?.();
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t border-slate-800 text-[11px] text-slate-500 leading-relaxed">
          Human-reviewed actions | Evidence-first decisions.
        </div>
      </aside>
    </>
  );
}
