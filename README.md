# ProofPilot AI

ProofPilot AI is a Razorpay Buildathon **AI Risk Manager** project.

It focuses on one class of merchant loss: **chargeback and dispute loss caused by missing, late, or scattered evidence**.

## Problem

Merchants often lose disputes even when they have a valid case because payment records, refund status, delivery proof, customer communication, and policy evidence are spread across different systems. By the time a chargeback deadline arrives, the response packet is incomplete or unsafe to submit.

## Solution

ProofPilot turns a risky dispute into an evidence-ready, human-approved response packet.

```text
Razorpay/payment signal
  -> ML loss-risk detector
  -> evidence verifier
  -> missing proof radar
  -> response packet draft
  -> rule-based decision
  -> human approval
  -> export + audit log
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

## Integrations

- PostgreSQL/Aiven for cases, evidence, timeline, and audit logs
- Razorpay test-mode keys for payment/dispute API access
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
