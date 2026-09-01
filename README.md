# ProofPilot AI

ProofPilot AI is a merchant dispute risk workspace for Razorpay-powered businesses.

It helps merchants detect high-risk dispute cases, collect required proof, prepare response packets, and require human approval before any external dispute action.

## Why This Matters

Merchants often lose disputes even when they have a valid case because evidence is late, incomplete, or scattered across payment records, refund status, delivery proof, customer communication, and policy documents.

ProofPilot focuses on one measurable loss class:

```text
Preventable merchant dispute loss caused by missing or late evidence.
```

The product is designed for operators who need to answer three questions quickly:

- Which cases can lose money?
- What proof is missing?
- What action is safe to take before the deadline?

## Product Workflow

```text
Razorpay dispute webhook
  -> signature verification
  -> idempotent event store
  -> payment signal store
  -> dispute case creation
  -> ML loss-risk scoring
  -> deterministic proof checklist
  -> missing evidence detection
  -> AI-assisted response draft
  -> human reviewer decision
  -> export, submit, or close with audit trail
```

## Core Product Features

- **Action Queue:** ranks open cases by merchant loss risk, proof gaps, and deadline urgency.
- **Queue Tabs:** separates `Open`, `Proof Ready`, `Escalated`, `Decided`, and `Closed` cases.
- **Evidence Passport:** required proof checklist per dispute type with upload, preview, replace, delete, timestamp, and storage status.
- **Case Timeline:** combines payment/dispute events, evidence changes, draft edits, and reviewer decisions.
- **AI Drafting:** classifies complaint intent, extracts useful signals, and drafts reviewer-facing response text.
- **Human Approval:** final approve, escalate, or accept decisions require a reviewer reason and are written to the audit log.
- **Backend Metrics:** money at risk, proof readiness, waiting decisions, recoverable value, and net merchant benefit are calculated server-side.
- **System Health:** verifies webhook safety, duplicate handling, evidence storage, AI fallback, approval controls, and external action safety.

## AI Boundary

ProofPilot uses AI only where judgment over unstructured text helps:

- classify complaint intent
- extract dates, names, refund mentions, and delivery claims
- detect missing evidence cues from notes
- summarize case context
- draft response text for a reviewer
- explain why a case is risky

ProofPilot does **not** let AI control:

- final refund decisions
- financial amount calculation
- ledger mutation
- webhook validation
- strict case state transitions
- contest/accept decisions without rules and human approval
- automatic dispute submission

The architecture is intentionally hybrid: AI assists the reviewer, deterministic services enforce the workflow, and humans approve final actions.

## Deterministic Case Lifecycle

```text
NEW_SIGNAL
  -> NEEDS_PROOF
  -> PROOF_READY
  -> DRAFT_READY
  -> AWAITING_APPROVAL
  -> APPROVED_TO_CONTEST
  -> CONTESTED / ACCEPTED_LOSS / ESCALATED
  -> CLOSED
```

Every case exposes a workflow snapshot with current state, next safe action, valid transitions, and whether external action is allowed.

## Metrics

ProofPilot calculates operational metrics on the backend, not in the UI.

- **Money At Risk:** sum of open `draft` and `escalated` case amounts.
- **Proof Ready:** open cases with required evidence readiness at or above threshold.
- **Waiting For Decision:** draft cases requiring reviewer action.
- **Ready To Recover:** contest-ready value backed by required proof.
- **Net Merchant Benefit:** recoverable value minus review cost.
- **False-positive Review Cost:** model review cost from evaluation confusion matrix.

Accepted, contested, and closed cases remain in history and audit logs, but are removed from active money-at-risk and action-queue counts.

## Failure Recovery

ProofPilot is designed to fail safely:

- Invalid webhook signatures are rejected and no case is created.
- Duplicate webhooks are acknowledged without creating duplicate cases.
- Incomplete dispute payloads fail validation before partial case writes.
- AI timeout falls back to deterministic scoring and reviewer-controlled drafting.
- Malformed AI JSON is discarded and replaced with schema-safe fallback output.
- Missing required proof blocks contest approval.
- External Razorpay actions require an approved packet and reviewer audit trail.

## Razorpay Integration

The primary case intake path is webhook-driven:

```text
payment.dispute.created -> ProofPilot case appears in dashboard
```

The app does not poll Razorpay every second. Razorpay sends a signed webhook when a dispute is created. Manual dispute sync is available as a recovery/backfill path when webhook delivery is missed or historical disputes need to be imported.

Expected Razorpay setup:

- Store Razorpay API keys only in server environment variables.
- Add the webhook endpoint in the Razorpay Dashboard.
- Enable the `payment.dispute.created` event for dispute intake.
- Configure the same webhook secret in Razorpay and ProofPilot.

## Evidence Storage

ProofPilot supports local evidence storage for development and S3-compatible storage for production.

Evidence files are linked to cases with:

- evidence key
- file name
- MIME type
- file size
- uploaded timestamp
- storage provider
- storage key
- download URL

## Evaluation Endpoints

```text
GET /api/evaluation
```

Returns architecture, AI boundary, model metrics, live impact metrics, and failure recovery proof.

```text
GET /api/reliability
```

Returns System Health checks for webhook verification, duplicate protection, AI fallback, proof blocking, evidence persistence, human approval, and external submission control.

## Verification

```bash
npm run lint
npm test
npm run build
```

The integration tests cover:

- invalid Razorpay webhook signature
- duplicate webhook idempotency
- missing-proof approval blocking
- reviewer decision reason in audit log
- evidence upload, download, and delete
- malformed AI output fallback
- AI timeout fallback
- system health checks
- connector safety when external accounts are not configured

## Local Development

```bash
npm install
npm run dev
```

Frontend:

```text
http://localhost:5173
```

API:

```text
http://localhost:10000
```

## Production Configuration

For a production deployment, configure:

- PostgreSQL database
- Razorpay API key and secret
- Razorpay webhook secret
- S3-compatible evidence storage
- JWT/OIDC authentication
- merchant subject mapping

Run database migrations before starting the production API:

```bash
npx prisma migrate deploy
```

## Honest Production Notes

The product workflow is implemented end to end for signed webhook intake, case creation, evidence handling, scoring, drafting, reviewer approval, metrics, and audit trail.

The following require real external merchant accounts or data to prove in production:

- historical Razorpay dispute outcomes for real ML training
- courier, support, email, or WhatsApp credentials for automatic multi-source evidence collection
- confirmed production S3 bucket permissions
- live Razorpay dispute submission test with a real dispute ID

## Positioning

ProofPilot is not a generic AI wrapper. It is a controlled financial workflow where AI supports judgment, deterministic services enforce safety, and human reviewers control final merchant actions.
