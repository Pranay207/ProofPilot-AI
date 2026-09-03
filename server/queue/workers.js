// ProofPilot BullMQ Workers
// Defines job processors for each queue.
// Workers only activate when Redis is available; otherwise jobs are handled synchronously.

import { registerWorker, QUEUE_NAMES, JOB_TYPES } from "./queueClient.js";

let workersStarted = false;

/**
 * Evidence ingest worker — handles async evidence processing jobs.
 */
async function evidenceIngestProcessor(job) {
  const { caseId, evidenceKey, storageKey, fileName } = job.data;
  console.info(`[Evidence Worker] Processing evidence '${evidenceKey}' for case ${caseId}`);
  // This is where you would:
  // 1. Re-validate the uploaded file (virus scan, content check)
  // 2. Generate thumbnails for images
  // 3. Extract text from PDFs for AI analysis
  // 4. Update case readiness score in DB
  // Placeholder: log and return success
  return { processed: true, caseId, evidenceKey, storageKey, fileName };
}

/**
 * Dispute submit worker — handles retryable Razorpay API submissions.
 */
async function disputeSubmitProcessor(job) {
  const { caseId, disputeId, action, evidence, summary } = job.data;
  console.info(`[Dispute Submit Worker] ${action} dispute ${disputeId} for case ${caseId}`);
  // This is where you would:
  // 1. Re-fetch case from DB to confirm it's still in approved state
  // 2. Call Razorpay API with the prepared evidence
  // 3. Update case packet_status to 'contested' or 'accepted'
  // 4. Write audit log entry
  // 5. Enqueue notification job
  // Placeholder: log and return job data
  return { submitted: true, caseId, disputeId, action };
}

/**
 * Notification worker — handles merchant notifications (email stubs, webhooks).
 */
async function notificationProcessor(job) {
  const { type, merchantEmail, caseId, message } = job.data;
  console.info(`[Notification Worker] Sending '${type}' notification for case ${caseId} to ${merchantEmail}`);
  // This is where you would:
  // 1. Send email via SendGrid/SES
  // 2. POST to merchant webhook URL
  // 3. Send Slack/Teams alert
  return { notified: true, type, caseId };
}

/**
 * Start all workers. Safe to call multiple times (idempotent).
 */
export async function startWorkers() {
  if (workersStarted) return;
  workersStarted = true;

  await registerWorker(QUEUE_NAMES.EVIDENCE_INGEST, evidenceIngestProcessor, { concurrency: 10 });
  await registerWorker(QUEUE_NAMES.DISPUTE_SUBMIT, disputeSubmitProcessor, { concurrency: 2 });
  await registerWorker(QUEUE_NAMES.NOTIFICATION, notificationProcessor, { concurrency: 20 });
}
