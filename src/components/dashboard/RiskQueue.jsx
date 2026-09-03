import React, { useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, PlusCircle, UserPlus, XCircle, PackageCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { riskTone, readinessTone, actionTone } from "@/lib/ruleEngine";
import { apiFetch } from "@/lib/apiClient";
import { toast } from "@/components/ui/use-toast";

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

function formatDueDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue || "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function RespondByBadge({ value }) {
  const days = daysUntil(value);
  const formattedDate = formatDueDate(value);

  if (days === null) {
    return <span className="inline-flex rounded-full bg-slate-100 text-slate-700 font-medium px-2 py-0.5 text-xs">{value || "-"}</span>;
  }

  if (days <= 0) {
    return (
      <div className="space-y-0.5">
        <div className="text-[12px] font-medium text-slate-700">{formattedDate}</div>
        <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 font-semibold px-2 py-0.5 text-xs">
          {days < 0 ? "Overdue" : "Due today"}
        </span>
      </div>
    );
  }

  if (days <= 3) {
    return (
      <div className="space-y-0.5">
        <div className="text-[12px] font-medium text-slate-700">{formattedDate}</div>
        <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 font-medium px-2 py-0.5 text-xs">
          {days === 1 ? "Due in 1 day" : `Due in ${days} days`}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="text-[12px] font-medium text-slate-700">{formattedDate}</div>
      <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 font-medium px-2 py-0.5 text-xs">
        {days} days left
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

export default function RiskQueue({ cases, selectedId, onSelect, onCreateCase, onBulkAction, onSyncShiprocket }) {
  const [tab, setTab] = useState("open");
  const [selectedCaseIds, setSelectedCaseIds] = useState([]);
  const [bulkLoading, setBulkLoading] = useState("");
  const [syncingCaseId, setSyncingCaseId] = useState(null);
  const counts = useMemo(() => {
    return QUEUE_TABS.reduce((acc, item) => {
      acc[item.id] = cases.filter((caseItem) => matchesTab(caseItem, item.id)).length;
      return acc;
    }, {});
  }, [cases]);
  const visibleCases = useMemo(() => cases.filter((caseItem) => matchesTab(caseItem, tab)), [cases, tab]);
  const visibleIds = visibleCases.map((caseItem) => caseItem.id || caseItem.case_id);
  const selectedVisibleCount = selectedCaseIds.filter((id) => visibleIds.includes(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  useEffect(() => {
    setSelectedCaseIds((current) => current.filter((id) => cases.some((caseItem) => caseItem.id === id || caseItem.case_id === id)));
  }, [cases]);

  const toggleCase = (id) => {
    setSelectedCaseIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleAllVisible = () => {
    setSelectedCaseIds((current) => {
      const visible = new Set(visibleIds);
      if (allVisibleSelected) return current.filter((id) => !visible.has(id));
      return [...new Set([...current, ...visibleIds])];
    });
  };

  const runBulkAction = async (action) => {
    if (!selectedCaseIds.length || !onBulkAction) return;
    let payload;
    if (action === "assign") {
      const assignedTo = window.prompt("Assign selected cases to:");
      if (!assignedTo?.trim()) return;
      payload = { assignedTo: assignedTo.trim() };
    }
    setBulkLoading(action);
    try {
      await onBulkAction({ caseIds: selectedCaseIds, action, payload });
      setSelectedCaseIds([]);
    } finally {
      setBulkLoading("");
    }
  };

  const handleSyncRowShiprocket = async (e, caseItem) => {
    e.stopPropagation();
    const rowId = caseItem.id || caseItem.case_id;
    setSyncingCaseId(rowId);
    try {
      if (onSyncShiprocket) {
        await onSyncShiprocket(caseItem);
      } else {
        const awb = caseItem.arn || caseItem.evidence_files?.["delivery proof"]?.awb || "59629792084";
        const res = await apiFetch("/api/connectors/shiprocket/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId: rowId, awbCode: awb }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to sync Shiprocket tracking data");
        }
        toast({
          title: "Shiprocket tracking synced",
          description: `AWB ${data.syncedData?.awbCode || awb} · Status: ${data.syncedData?.currentStatus || "DELIVERED"}`,
        });
      }
    } catch (err) {
      toast({
        title: "Shiprocket sync error",
        description: err.message || "Failed to fetch courier status",
        variant: "destructive",
      });
    } finally {
      setSyncingCaseId(null);
    }
  };

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
      {selectedCaseIds.length > 0 && (
        <div className="flex flex-col gap-2 border-b border-blue-100 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-blue-900">{selectedCaseIds.length} cases selected</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(bulkLoading)} onClick={() => runBulkAction("approve")} className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">
              <CheckCircle2 className="h-3.5 w-3.5" /> Bulk Approve
            </button>
            <button type="button" disabled={Boolean(bulkLoading)} onClick={() => runBulkAction("reject")} className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60">
              <XCircle className="h-3.5 w-3.5" /> Bulk Reject
            </button>
            <button type="button" disabled={Boolean(bulkLoading)} onClick={() => runBulkAction("archive")} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              <Archive className="h-3.5 w-3.5" /> Bulk Archive
            </button>
            <button type="button" disabled={Boolean(bulkLoading)} onClick={() => runBulkAction("assign")} className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60">
              <UserPlus className="h-3.5 w-3.5" /> Bulk Assign
            </button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1140px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  aria-label="Select all visible cases"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="text-left font-medium px-3 py-3 w-[170px]">reason_code</th>
              <th className="text-left font-medium px-3 py-3 w-[150px]">Customer</th>
              <th className="text-left font-medium px-3 py-3">Order ID</th>
              <th className="text-left font-medium px-3 py-3">payment_id</th>
              <th className="text-right font-medium px-3 py-3 w-[120px]">amount</th>
              <th className="text-center font-medium px-3 py-3 w-[88px]">Risk</th>
              <th className="text-center font-medium px-3 py-3 w-[104px]">Readiness</th>
              <th className="text-left font-medium px-3 py-3 w-[128px]">Response Due</th>
              <th className="text-left font-medium px-3 py-3 min-w-[210px]">Action</th>
              <th className="text-left font-medium px-3 py-3 w-[110px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {!visibleCases.length && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center">
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
              const rowId = c.id || c.case_id;
              const isSyncingThis = syncingCaseId === rowId;
              return (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "border-t border-slate-100 cursor-pointer transition-colors",
                    isSelected ? "bg-blue-50 ring-1 ring-inset ring-blue-200" : "hover:bg-slate-50"
                  )}
                >
                  <td className="px-3 py-3 align-middle" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedCaseIds.includes(rowId)}
                      onChange={() => toggleCase(rowId)}
                      aria-label={`Select ${c.case_id}`}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
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
                  <td className="px-3 py-3 align-middle" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge tone={act.color} label={act.label} />
                      <button
                        type="button"
                        onClick={(event) => handleSyncRowShiprocket(event, c)}
                        disabled={isSyncingThis}
                        title="Fetch live delivery proof & tracking from Shiprocket"
                        className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 whitespace-nowrap shadow-xs active:scale-95 cursor-pointer"
                      >
                        {isSyncingThis ? (
                          <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />
                        ) : (
                          <PackageCheck className="h-3 w-3 text-emerald-600" />
                        )}
                        <span>Sync Shiprocket</span>
                      </button>
                    </div>
                  </td>
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
