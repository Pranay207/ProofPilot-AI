import { EVIDENCE_LABELS, getRequired, scoreCase } from "../../src/lib/ruleEngine.js";

export function buildEvidenceChecklist(caseItem) {
  const required = getRequired(caseItem.dispute_type);
  const available = new Set(caseItem.available_evidence || []);
  return required.map((key) => ({
    key,
    label: EVIDENCE_LABELS[key] || key,
    status: available.has(key) ? "available" : "missing",
  }));
}

export function applyEvidence(caseItem, evidenceKey) {
  const available = [...new Set([...(caseItem.available_evidence || []), evidenceKey])];
  const missing = (caseItem.missing_evidence || []).filter((key) => key !== evidenceKey);
  return {
    ...caseItem,
    available_evidence: available,
    missing_evidence: missing,
    ...scoreCase({ ...caseItem, available_evidence: available, missing_evidence: missing }),
  };
}
