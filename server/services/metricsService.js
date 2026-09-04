import { calculateProofPilotMetrics, REVIEW_COST_PER_CASE, TIME_SAVED_MIN_PER_CASE } from "../../src/lib/metrics.js";
import { MODEL_CARD } from "../../src/lib/mlRiskModel.js";

export function buildMetricsResponse(cases = []) {
  const metrics = calculateProofPilotMetrics(cases);
  return {
    ok: true,
    source: "backend",
    metrics,
    formulas: {
      money_at_risk: "sum(amount) where packet_status is draft or escalated",
      recoverable_value: "sum(amount) where packet_status is draft, recommended_action is contest, and readiness_score >= 80",
      prevented_loss: "sum(amount) where packet_status is approved and recommended_action is contest",
      net_benefit: "prevented_loss + recoverable_value - review_cost",
      review_cost: `total_cases x INR ${REVIEW_COST_PER_CASE}`,
      time_saved: `total_cases x ${TIME_SAVED_MIN_PER_CASE} minutes`,
      readiness_score: "required evidence present / required evidence",
      risk_score: "trained loss probability plus deterministic guardrails",
    },
    model_card: MODEL_CARD,
  };
}

export function buildEvaluationResponse(cases = [], failureRecovery = []) {
  const metricsPayload = buildMetricsResponse(cases);
  const validation = MODEL_CARD.validation || {};
  const confusion = validation.confusion || {};

  return {
    ok: true,
    problem: {
      track: "AI Risk Manager",
      loss_class: "Chargeback and dispute loss caused by missing or late merchant evidence",
      measurable_outcome: "Reduce preventable dispute loss and review time while controlling false-positive review cost",
    },
    architecture: {
      data_flow: [
        "signed Razorpay webhook",
        "idempotent event store",
        "payment signal store",
        "case creation",
        "ML loss-risk score",
        "deterministic evidence checklist",
        "rule-based recommendation",
        "human final approval",
        "audit trail",
      ],
      ai_boundary: "AI classifies unstructured complaint text and drafts reviewer copy. Rules and humans control decisions.",
      financial_safety: "ProofPilot never auto-submits disputes or refunds from AI output.",
    },
    model: {
      name: MODEL_CARD.name,
      type: MODEL_CARD.type,
      features: MODEL_CARD.features,
      validation: {
        precision: validation.precision,
        recall: validation.recall,
        f1: validation.f1,
        accuracy: validation.accuracy,
        holdout_rows: validation.holdout_rows,
        confusion,
        baseline_naive: validation.baseline_naive || null,
        false_positive_review_cost_inr: Number(confusion.fp || 0) * REVIEW_COST_PER_CASE,
      },
    },
    live_metrics: {
      cases: metricsPayload.metrics.totalCases,
      high_risk_cases: metricsPayload.metrics.highRiskCases,
      proof_ready_cases: metricsPayload.metrics.evidenceReadyCases,
      waiting_for_decision: metricsPayload.metrics.awaitingApprovalCases,
      money_at_risk_inr: metricsPayload.metrics.valueAtRisk,
      recoverable_value_inr: metricsPayload.metrics.recoverableValue,
      net_benefit_inr: metricsPayload.metrics.netBenefit,
      ops_time_saved_minutes: metricsPayload.metrics.reviewMinutesSaved,
      assumptions: {
        review_cost_per_case_inr: REVIEW_COST_PER_CASE,
        time_saved_per_case_minutes: TIME_SAVED_MIN_PER_CASE,
      },
    },
    failure_recovery: failureRecovery,
  };
}
