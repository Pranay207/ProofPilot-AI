export function isTimestampedRecord(record) {
  return Boolean(record && record.attached_at && record.status !== "failed");
}

export async function persistConnectorEvidence({ items = [], persistOne }) {
  const persisted = [];
  const failed = [];

  for (const item of items) {
    if (!item?.auto_available || !item.evidence_key) continue;
    try {
      const record = await persistOne(item);
      if (!isTimestampedRecord(record)) {
        throw new Error("Persist did not return a timestamped evidence record");
      }
      persisted.push({
        evidence_key: item.evidence_key,
        attached_at: record.attached_at,
        status: "available",
        source: record.source || item.source || "connector",
      });
    } catch (error) {
      failed.push({
        evidence_key: item.evidence_key,
        error: error.message,
      });
    }
  }

  return { persisted, failed };
}

export function applyPersistedEvidenceToCase(caseItem, persistedItems = []) {
  const persisted_evidence = { ...(caseItem.persisted_evidence || {}) };
  for (const item of persistedItems) {
    if (!item?.evidence_key || !item.attached_at) continue;
    persisted_evidence[item.evidence_key] = {
      attached_at: item.attached_at,
      status: item.status || "available",
      source: item.source || "connector",
    };
  }
  return { ...caseItem, persisted_evidence };
}
