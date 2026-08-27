import { PrismaClient } from "@prisma/client";
import { SAMPLE_CASES } from "../src/lib/sampleData.js";
import { EVIDENCE_LABELS } from "../src/lib/ruleEngine.js";

const prisma = new PrismaClient();

const merchant = {
  name: "Kova Commerce Demo",
  email: "ops@kova-commerce.example",
};

function toDate(value) {
  return new Date(value || Date.now());
}

async function main() {
  const savedMerchant = await prisma.merchant.upsert({
    where: { email: merchant.email },
    update: merchant,
    create: merchant,
  });

  for (const item of SAMPLE_CASES) {
    const savedCase = await prisma.case.upsert({
      where: { caseId: item.case_id },
      update: {
        riskScore: item.risk_score,
        readinessScore: item.readiness_score,
        recommendedAction: item.recommended_action,
        actionReason: item.action_reason,
        packetStatus: item.packet_status,
        merchantResponseDraft: item.merchant_response_draft,
      },
      create: {
        caseId: item.case_id,
        merchantId: savedMerchant.id,
        paymentId: item.payment_id,
        orderId: item.order_id,
        disputeId: item.dispute_id,
        refundId: item.refund_id || null,
        arn: item.arn || null,
        rrn: item.rrn || null,
        utr: item.utr || null,
        customerName: item.customer_name,
        customerEmail: item.customer_email,
        amountPaise: item.amount * 100,
        currency: item.currency,
        paymentStatus: item.payment_status,
        refundStatus: item.refund_status,
        deliveryStatus: item.delivery_status,
        disputeType: item.dispute_type,
        disputeReason: item.dispute_reason,
        riskScore: item.risk_score,
        readinessScore: item.readiness_score,
        confidenceScore: item.confidence_score,
        customerMessage: item.customer_message,
        caseSummary: item.case_summary,
        recommendedAction: item.recommended_action,
        actionReason: item.action_reason,
        deadline: toDate(item.deadline),
        owner: item.owner,
        team: item.team,
        packetStatus: item.packet_status,
        merchantResponseDraft: item.merchant_response_draft,
      },
    });

    const allEvidence = new Set([...(item.available_evidence || []), ...(item.missing_evidence || [])]);
    for (const key of allEvidence) {
      const available = item.available_evidence?.includes(key);
      await prisma.evidenceItem.upsert({
        where: { caseId_key: { caseId: savedCase.id, key } },
        update: { status: available ? "available" : "missing" },
        create: {
          caseId: savedCase.id,
          key,
          label: EVIDENCE_LABELS[key] || key,
          status: available ? "available" : "missing",
        },
      });
    }

    for (const event of item.timeline_events || []) {
      await prisma.timelineEvent.create({
        data: {
          caseId: savedCase.id,
          event: event.event,
          timestamp: toDate(event.timestamp),
          status: event.status,
          detail: event.detail,
        },
      });
    }

    for (const log of item.audit_log || []) {
      await prisma.auditLog.create({
        data: {
          caseId: savedCase.id,
          timestamp: toDate(log.timestamp),
          actor: log.actor,
          action: log.action,
          detail: log.detail,
        },
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seeded ProofPilot demo data.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });