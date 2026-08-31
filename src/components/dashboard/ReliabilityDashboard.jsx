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

function SafeguardCard({ title, description, healthy }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${healthy ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {healthy ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
        </div>
      </div>
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
  const findCheck = (key) => checks.find((check) => check.key === key);
  const isHealthy = (key) => findCheck(key)?.status === "passing";
  const queueCheck = findCheck("job_queue");
  const allCoreHealthy = [
    "webhook_signature",
    "webhook_idempotency",
    "state_machine",
    "missing_evidence_block",
    "human_approval",
    "ai_fallback",
    "evidence_storage",
    "external_submission",
  ].every((key) => ["passing", "local_storage"].includes(findCheck(key)?.status));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">System Health</h2>
          <p className="text-sm text-slate-500">Connection and control status for payment disputes, evidence, and approvals.</p>
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

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Safeguards</h3>
            <p className="mt-1 text-xs text-slate-500">Core controls that keep dispute handling accurate and reviewer-led.</p>
          </div>
          <StatusBadge status={allCoreHealthy ? "passing" : "needs_review"} />
        </div>

        {loading && !checks.length ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
            Loading system health report...
          </div>
        ) : (
          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            <SafeguardCard
              title="Secure event intake"
              description="Only verified Razorpay events are accepted, and repeated deliveries do not create duplicate cases."
              healthy={isHealthy("webhook_signature") && isHealthy("webhook_idempotency")}
            />
            <SafeguardCard
              title="Controlled case workflow"
              description="Cases follow a fixed review flow, and incomplete proof blocks contest actions."
              healthy={isHealthy("state_machine") && isHealthy("missing_evidence_block")}
            />
            <SafeguardCard
              title="Reviewer-approved actions"
              description="Risk classification assists the reviewer. Final dispute actions require approval and an audit trail."
              healthy={isHealthy("ai_fallback") && isHealthy("human_approval") && isHealthy("external_submission")}
            />
          </div>
        )}

        {queueCheck?.status !== "passing" && (
          <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Persistent background retries are not enabled for this environment.
          </div>
        )}
      </div>
    </div>
  );
}
