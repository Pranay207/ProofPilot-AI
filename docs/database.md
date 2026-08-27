# ProofPilot Database Layer

ProofPilot uses PostgreSQL for production architecture and local sample data for the frontend demo.

## Why PostgreSQL

Chargeback operations are relational:

- one merchant has many cases
- one case has many evidence items
- one case has many timeline events
- one case has many audit log entries

PostgreSQL makes auditability, filtering, reporting, and joins clear for a fintech workflow.

## Local Demo

The React app currently runs from `src/lib/sampleData.js` so it works without installing PostgreSQL.

The API can also run without a database:

```bash
npm run dev:api
```

It will serve local sample data at:

```text
GET http://localhost:4000/api/health
GET http://localhost:4000/api/cases
```

## PostgreSQL Mode

Create `.env` from `.env.example`, set `DATABASE_URL`, then run:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
USE_DATABASE=true npm run dev:api
```

## Core Tables

- `Merchant`
- `Case`
- `EvidenceItem`
- `TimelineEvent`
- `AuditLog`

## Correct Workflow

Razorpay/payment event -> Case normalizer -> ML loss-risk detector -> Evidence verifier -> Missing proof radar -> Response packet generator -> Rule decision -> Human approval -> Export packet -> Audit log -> Metrics dashboard.

ProofPilot is scoped to one AI Risk Manager loss class: merchant dispute/chargeback loss caused by missing, late, or scattered evidence.
