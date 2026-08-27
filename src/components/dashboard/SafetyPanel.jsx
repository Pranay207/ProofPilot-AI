import React from "react";
import { ShieldCheck, Ban, Lock, Gauge, ScrollText, Cog } from "lucide-react";

const GUARDRAILS = [
  { icon: Ban, label: "No refund promises", desc: "AI never promises refunds to customers." },
  { icon: Lock, label: "No auto-submit", desc: "Disputes are never submitted automatically." },
  { icon: ShieldCheck, label: "Human approval required", desc: "Every packet needs a human decision." },
  { icon: Gauge, label: "Confidence score shown", desc: "Every recommendation carries a score." },
  { icon: ScrollText, label: "Audit trail maintained", desc: "All actions logged immutably." },
  { icon: Cog, label: "Rule engine controls final recommendation", desc: "AI assists; rules decide." },
];

export default function SafetyPanel() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-slate-900">Safety & Fintech Guardrails</h3>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {GUARDRAILS.map((g) => {
          const Icon = g.icon;
          return (
            <div key={g.label} className="flex items-start gap-2 rounded-md border border-slate-100 bg-slate-50/60 p-2.5">
              <Icon className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-medium text-slate-800">{g.label}</div>
                <div className="text-[11px] text-slate-500 leading-snug">{g.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}