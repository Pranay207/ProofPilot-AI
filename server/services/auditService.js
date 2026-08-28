export function createAudit(actor, action, detail) {
  return { timestamp: new Date().toISOString(), actor, action, detail };
}

export function appendAudit(caseItem, actor, action, detail) {
  return {
    ...caseItem,
    audit_log: [...(caseItem.audit_log || []), createAudit(actor, action, detail)],
  };
}
