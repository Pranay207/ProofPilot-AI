export const REVIEW_COST_PER_CASE = 55;
export const TIME_SAVED_MIN_PER_CASE = 24;
export const OPEN_CASE_STATUSES = new Set(["draft", "escalated"]);

export function formatMoney(value) {
  return `INR ${Number(value || 0).toLocaleString("en-IN")}`;
}

export function calculateProofPilotMetrics(cases = []) {
  const totalCases = cases.length;
  const openCases = cases.filter((item) => OPEN_CASE_STATUSES.has(item.packet_status || "draft"));
  const highRiskCases = openCases.filter((item) => item.risk_score >= 75).length;
  const evidenceReadyCases = openCases.filter((item) => item.readiness_score >= 80).length;
  const awaitingApprovalCases = cases.filter((item) => item.packet_status === "draft").length;
  const escalatedCases = cases.filter((item) => item.packet_status === "escalated").length;
  const acceptedCases = cases.filter((item) => item.packet_status === "accepted").length;
  const approvedContestCases = cases.filter((item) => item.packet_status === "approved" && item.recommended_action === "contest");
  const contestReadyCases = cases.filter((item) => item.packet_status === "draft" && item.recommended_action === "contest" && item.readiness_score >= 80);
  const actionReadyCases = openCases.filter((item) => item.recommended_action === "contest" && item.readiness_score >= 80);

  const totalValue = cases.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const valueAtRisk = openCases.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const preventedLoss = approvedContestCases.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const recoverableValue = contestReadyCases.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const acceptedRefundValue = cases
    .filter((item) => item.packet_status === "accepted" || item.recommended_action === "accept")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const reviewCost = totalCases * REVIEW_COST_PER_CASE;
  const netBenefit = preventedLoss + recoverableValue - reviewCost;

  const averageDisputeValue = totalCases ? Math.round(totalValue / totalCases) : 0;
  const averageRisk = totalCases ? Math.round(cases.reduce((sum, item) => sum + Number(item.risk_score || 0), 0) / totalCases) : 0;
  const averageReadiness = totalCases ? Math.round(cases.reduce((sum, item) => sum + Number(item.readiness_score || 0), 0) / totalCases) : 0;
  const averageConfidence = totalCases ? Math.round(cases.reduce((sum, item) => sum + Number(item.confidence_score || 0), 0) / totalCases) : 0;
  const falsePositiveReviewCount = cases.filter((item) => item.risk_score >= 75 && item.recommended_action !== "contest").length;
  const falsePositiveRate = totalCases ? Math.round((falsePositiveReviewCount / totalCases) * 100) : 0;
  const reviewMinutesSaved = totalCases * TIME_SAVED_MIN_PER_CASE;

  return {
    totalCases,
    openCases: openCases.length,
    highRiskCases,
    evidenceReadyCases,
    awaitingApprovalCases,
    escalatedCases,
    acceptedCases,
    approvedContestCases: approvedContestCases.length,
    contestReadyCases: contestReadyCases.length,
    actionReadyCases: actionReadyCases.length,
    totalValue,
    valueAtRisk,
    preventedLoss,
    recoverableValue,
    acceptedRefundValue,
    reviewCost,
    netBenefit,
    averageDisputeValue,
    averageRisk,
    averageReadiness,
    averageConfidence,
    falsePositiveReviewCount,
    falsePositiveRate,
    reviewMinutesSaved,
  };
}
