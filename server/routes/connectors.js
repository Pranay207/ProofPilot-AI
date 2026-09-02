// ProofPilot-AI — Shiprocket Connector Route & Controller
import { Router } from "express";
import { fetchShiprocketTracking, tokenManager } from "../../src/services/shiprocketService.js";
import { EVIDENCE_LABELS, scoreCase } from "../../src/lib/ruleEngine.js";

export const connectorRouter = Router();

/**
 * POST /api/connectors/shiprocket/sync
 *
 * Request Body:
 * {
 *   "caseId": "PP-2026-0001",
 *   "awbCode": "143261234567"
 * }
 */
export async function handleShiprocketSync(req, res, next) {
  const caseId = String(req.body?.caseId || req.body?.case_id || "").trim();
  const awbCode = String(req.body?.awbCode || req.body?.awb_code || "").trim();

  if (!caseId) {
    return res.status(400).json({
      success: false,
      error: "caseId is required for Shiprocket sync",
    });
  }

  if (!awbCode) {
    return res.status(400).json({
      success: false,
      error: "awbCode is required for Shiprocket sync",
    });
  }

  const getPrisma = req.app.get("getPrisma") || (async () => null);
  const getCaseByParam = req.app.get("getCaseByParam");
  const toFrontendCase = req.app.get("toFrontendCase");
  const getLocalCases = req.app.get("getLocalCases");
  const setLocalCases = req.app.get("setLocalCases");
  const addAudit = req.app.get("addAudit");

  const db = await getPrisma();

  try {
    let caseItem = null;
    let caseRow = null;

    if (db) {
      caseRow = await getCaseByParam(db, caseId, req.merchant?.id);
      if (!caseRow) {
        return res.status(404).json({ success: false, error: `Case ${caseId} not found` });
      }
      caseItem = toFrontendCase(caseRow);
    } else {
      const localList = getLocalCases ? getLocalCases() : [];
      caseItem = localList.find((item) => item.id === caseId || item.case_id === caseId);
      if (!caseItem) {
        return res.status(404).json({ success: false, error: `Case ${caseId} not found` });
      }
    }

    // 2. Fetch live tracking data from Shiprocket API
    const syncedData = await fetchShiprocketTracking(awbCode);

    // 3. Normalize evidence checklist status ('VERIFIED' if delivered, else 'IN_PROGRESS')
    const evidenceStatus = syncedData.isDelivered ? "VERIFIED" : "IN_PROGRESS";
    const dbStatus = syncedData.isDelivered ? "available" : "pending";

    const auditDetail = `Synced AWB: ${syncedData.awbCode} | Courier: ${syncedData.courierName} | Status: ${syncedData.currentStatus}${syncedData.podUrl ? ` | POD: ${syncedData.podUrl}` : ""}`;

    // 4. Update Database or In-Memory State
    if (db && caseRow) {
      // Upsert delivery_proof evidence item
      await db.evidenceItem.upsert({
        where: { caseId_key: { caseId: caseRow.id, key: "delivery proof" } },
        update: {
          status: dbStatus,
          fileName: syncedData.podUrl ? `pod_${syncedData.awbCode}.pdf` : `tracking_${syncedData.awbCode}.json`,
          mimeType: syncedData.podUrl ? "application/pdf" : "application/json",
          attachedAt: new Date(),
        },
        create: {
          caseId: caseRow.id,
          key: "delivery proof",
          label: EVIDENCE_LABELS["delivery proof"] || "Delivery proof (POD)",
          status: dbStatus,
          fileName: syncedData.podUrl ? `pod_${syncedData.awbCode}.pdf` : `tracking_${syncedData.awbCode}.json`,
          mimeType: syncedData.podUrl ? "application/pdf" : "application/json",
          attachedAt: new Date(),
        },
      });

      // Upsert tracking snapshot evidence item
      await db.evidenceItem.upsert({
        where: { caseId_key: { caseId: caseRow.id, key: "tracking snapshot" } },
        update: {
          status: "available",
          attachedAt: new Date(),
        },
        create: {
          caseId: caseRow.id,
          key: "tracking snapshot",
          label: EVIDENCE_LABELS["tracking snapshot"] || "Tracking snapshot",
          status: "available",
          attachedAt: new Date(),
        },
      });

      // 5. Insert Atomic Audit Log
      await db.auditLog.create({
        data: {
          caseId: caseRow.id,
          actor: "Shiprocket Connector",
          action: "Shiprocket API Sync Completed",
          detail: auditDetail,
        },
      });

      // Recalculate case risk and readiness score
      const refreshed = await getCaseByParam(db, caseId, req.merchant?.id);
      const mapped = toFrontendCase(refreshed);
      const scores = scoreCase(mapped);
      await db.case.update({
        where: { id: refreshed.id },
        data: {
          riskScore: scores.risk_score,
          readinessScore: scores.readiness_score,
          confidenceScore: scores.confidence_score,
          recommendedAction: scores.recommended_action,
          actionReason: scores.action_reason,
        },
      });

      return res.status(200).json({
        success: true,
        caseId,
        syncedData: {
          ...syncedData,
          evidenceStatus,
        },
      });
    } else {
      // In-Memory Fallback Update
      let updatedCase = null;
      if (getLocalCases && setLocalCases && addAudit) {
        const localList = getLocalCases();
        const updatedList = localList.map((item) => {
          if (item.id !== caseId && item.case_id !== caseId) return item;
          const available = [...new Set([...(item.available_evidence || []), "tracking snapshot", ...(syncedData.isDelivered ? ["delivery proof"] : [])])];
          const missing = (item.missing_evidence || []).filter((k) => k !== "tracking snapshot" && (!syncedData.isDelivered || k !== "delivery proof"));
          const updated = {
            ...item,
            available_evidence: available,
            missing_evidence: missing,
            connector_status: "synced",
            delivery_proof_data: syncedData,
          };
          const scores = scoreCase(updated);
          updatedCase = addAudit(
            { ...updated, ...scores },
            "Shiprocket Connector",
            "Shiprocket API Sync Completed",
            auditDetail
          );
          return updatedCase;
        });
        setLocalCases(updatedList);
      }

      return res.status(200).json({
        success: true,
        caseId,
        syncedData: {
          ...syncedData,
          evidenceStatus,
        },
      });
    }
  } catch (error) {
    // Record failure in audit log if possible
    if (db) {
      try {
        const caseRow = await getCaseByParam(db, caseId, req.merchant?.id);
        if (caseRow) {
          await db.auditLog.create({
            data: {
              caseId: caseRow.id,
              actor: "Shiprocket Connector",
              action: "Shiprocket API Sync Failed",
              detail: `Failed to sync AWB ${awbCode}: ${error.message}`,
            },
          });
        }
      } catch {
        // Ignore secondary audit logging error
      }
    }

    const statusCode = error.message?.includes("credentials") ? 503 : 400;
    return res.status(statusCode).json({
      success: false,
      connector_status: "failed",
      caseId,
      error: error.message || "Failed to sync tracking with Shiprocket API",
    });
  }
}

connectorRouter.post("/shiprocket/sync", handleShiprocketSync);
