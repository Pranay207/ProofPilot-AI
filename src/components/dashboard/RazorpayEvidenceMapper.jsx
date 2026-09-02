import React from "react";
import { CheckCircle2, Link2, XCircle } from "lucide-react";
import { buildRazorpayEvidenceMapping } from "@/lib/razorpayEvidenceMapper";
import { cn } from "@/lib/utils";

function MappingBadge({ children, ready }) {
  return (
    <span
      className={cn(
        "inline-flex rounded border px-2 py-1 font-mono text-xs font-semibold",
        ready ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-600"
      )}
    >
      {children}
    </span>
  );
}

export default function RazorpayEvidenceMapper({ caseItem }) {
  if (!caseItem) return null;
  const mapping = buildRazorpayEvidenceMapping(caseItem);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">Razorpay API Evidence Mapper</h3>
          </div>
          <p className="mt-1 text-xs font-medium text-slate-600">
            Uploaded merchant proof is mapped to Razorpay contest payload parameters.
          </p>
        </div>
        <span
          className={cn(
            "rounded-md border px-2.5 py-1 text-xs font-semibold",
            mapping.ready ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
          )}
        >
          {mapping.mapped_parameter_count}/{mapping.required_parameter_count} Required API Keys Mapped
        </span>
      </div>

      <div className="grid gap-2">
        {mapping.required_rows.map((row) => (
          <div key={row.evidence_key} className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)_220px] md:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {row.attached ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
                <span className="text-sm font-semibold text-slate-900">{row.razorpay_label}</span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-600">{row.label}</p>
            </div>
            <div className="min-w-0 text-xs font-medium text-slate-600">
              {row.file?.file_name ? (
                <span className="block truncate" title={row.file.file_name}>{row.file.file_name}</span>
              ) : (
                <span className="text-slate-500">Upload required proof to map this field.</span>
              )}
            </div>
            <div className="md:justify-self-end">
              <MappingBadge ready={row.attached}>Mapped to: {row.razorpay_parameter}</MappingBadge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
