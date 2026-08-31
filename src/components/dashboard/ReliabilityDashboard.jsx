import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, RefreshCw, ShieldCheck, UploadCloud, Webhook } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";

const statusStyles = {
  passing: "border-emerald-100 bg-emerald-50 text-emerald-700",
  local_storage: "border-amber-100 bg-amber-50 text-amber-700",
  needs_config: "border-amber-100 bg-amber-50 text-amber-700",
  needs_review: "border-red-100 bg-red-50 text-red-700",
};

function StatusBadge({ status }) {
  const label = {
    passing: "Healthy",
    local_storage: "Local storage",
    needs_config: "Action needed",
    needs_review: "Needs review",
  }[status] || "Review";

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold ${statusStyles[status] || statusStyles.needs_review}`}>
      {label}
    </span>
  );
}

function IntegrationCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-4 w-4 text-emerald-600" />
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-950">{value || "Not configured"}</div>
    </div>
  );
}

export default function ReliabilityDashboard() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/reliability");
      const next = await res.json();
      if (!res.ok) throw new Error(next.error || "System health report unavailable");
      setPayload(next);
    } catch (reportError) {
      setError(reportError.message || "System health report unavailable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const checks = payload?.checks || [];
  const integrations = payload?.integrations || {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">System Health</h2>
          <p className="text-sm text-slate-500">Operational checks for secure dispute intake, evidence handling, and approval controls.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <IntegrationCard icon={Database} label="Case store" value={integrations.case_store} />
        <IntegrationCard icon={ShieldCheck} label="Razorpay" value={integrations.razorpay} />
        <IntegrationCard icon={Webhook} label="Webhook security" value={integrations.webhook_secret ? "Verified" : "Pending setup"} />
        <IntegrationCard icon={UploadCloud} label="Evidence storage" value={integrations.evidence_storage} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Operational Checks</h3>
          <p className="mt-1 text-xs text-slate-500">Live safeguards for webhook intake, duplicate handling, evidence storage, and controlled dispute actions.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {loading && !checks.length ? (
            <div className="px-4 py-8 text-sm text-slate-500">Loading system health report...</div>
          ) : (
            checks.map((check) => (
              <div key={check.key} className="grid gap-3 px-4 py-4 md:grid-cols-[220px_130px_minmax(0,1fr)] md:items-center">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`h-4 w-4 ${check.status === "passing" ? "text-emerald-600" : "text-amber-600"}`} />
                  <span className="text-sm font-semibold text-slate-900">{check.label}</span>
                </div>
                <StatusBadge status={check.status} />
                <p className="text-sm leading-relaxed text-slate-600">{check.proof}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
