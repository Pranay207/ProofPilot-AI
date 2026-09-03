export const CASE_ROUTE_CONTRACT = {
  list: "GET /api/cases",
  create: "POST /api/cases",
  attachEvidence: "PATCH /api/cases/:id/evidence",
  editDraft: "PATCH /api/cases/:id/draft",
  decide: "PATCH /api/cases/:id/decision",
  exportPacket: "POST /api/cases/:id/export",
  submit: "POST /api/cases/:id/submit",
  bulkAction: "POST /api/cases/bulk-action",
  delete: "DELETE /api/cases/:id",
};
