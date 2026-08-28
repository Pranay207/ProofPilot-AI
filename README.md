# ProofPilot AI

ProofPilot AI is a Razorpay Buildathon **AI Risk Manager** project.

It focuses on one class of merchant loss: **chargeback and dispute loss caused by missing, late, or scattered evidence**.

## Problem

Merchants often lose disputes even when they have a valid case because payment records, refund status, delivery proof, customer communication, and policy evidence are spread across different systems. By the time a chargeback deadline arrives, the response packet is incomplete or unsafe to submit.

## Solution

ProofPilot turns a risky dispute into an evidence-ready, human-approved response packet.

```text
Signed Razorpay webhook
  -> idempotent event store
  -> payment signal store
  -> dispute case creation
  -> ML loss-risk detector
  -> deterministic evidence checklist
  -> missing proof detection
  -> AI-assisted response draft
  -> rule-based recommendation
  -> human final decision
  -> export + audit trail
```

## Track Fit

- Track: AI Risk Manager
- Direction: Chargeback evidence responder
- Working system: detector + verifier + human-approved responder
- Measured bar: precision, recall, F1, false-positive review cost
- Safety: defense-only; ProofPilot never auto-submits disputes or refunds

## Model

The prototype uses a trained logistic regression model to estimate merchant-loss probability from:

- dispute type
- payment amount
- missing evidence ratio
- critical missing proof ratio
- deadline urgency
- payment/refund/delivery status mismatch
- complaint signal
- evidence readiness

The app displays the model card in the Metrics Dashboard. In production, the same pipeline can be replaced with LightGBM/XGBoost trained on historical Razorpay dispute outcomes.

## AI Boundary

ProofPilot uses AI only where judgment over unstructured information helps:

- classify complaint intent
- extract missing proof cues
- summarize payment/refund/delivery context
- draft reviewer-facing response text

ProofPilot does **not** let AI control:

- final refund decisions
- exact money calculations
- webhook verification
- dispute submission
- case state transitions

Rules calculate readiness and recommendations. A human reviewer approves, escalates, or accepts every case before external action.

## Case Lifecycle

```text
NEW_SIGNAL
  -> NEEDS_PROOF
  -> PROOF_READY
  -> DRAFT_READY
  -> AWAITING_APPROVAL
  -> APPROVED_TO_CONTEST / ACCEPTED_LOSS / ESCALATED
  -> CLOSED
```

Each case exposes a `workflow` snapshot with current state, next safe action, and whether external action is allowed.

## Failure Recovery

- Invalid webhook signature: reject and do not create a case.
- Duplicate webhook: return success safely and avoid duplicate case creation.
- Incomplete dispute payload: return validation error; do not partially write a case.
- AI timeout: use deterministic score and fallback draft; route to human review.
- AI invalid JSON: discard malformed output and use a schema-safe fallback response.
- Database write failure: return API error; never mark external action completed.

## Evaluator Endpoint

```text
GET /api/evaluation
```

Returns the judge-facing proof:

- problem and track fit
- architecture flow
- AI boundary
- model precision, recall, F1, accuracy, and false-positive review cost
- live merchant impact metrics
- failure recovery behavior

## Integrations

- PostgreSQL case store for payment signals, webhook events, cases, evidence, timeline, and audit logs
- Razorpay API keys for payment/dispute API access
- Signature-protected Razorpay webhook receiver
- Exportable dispute packet JSON

## Local Run

```bash
npm install
npm run dev:api
npm run dev
```

Frontend:

```text
http://localhost:5173
```

API:

```text
http://localhost:4000
```

Keep secrets only in `.env`. Do not commit Razorpay keys.
