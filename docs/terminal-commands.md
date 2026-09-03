# ProofPilot-AI: Master Terminal Commands Reference

This document compiles **every single terminal command** across the entire lifecycle of **ProofPilot-AI** — from local setup, database provisioning, machine learning training, and test automation to full REST API interactions, webhook simulations, and cloud verification.

---

## Table of Contents
1. [Development & Server Lifecycle](#1-development--server-lifecycle)
2. [Automated Testing & Code Quality](#2-automated-testing--code-quality)
3. [Database & Prisma Operations (PostgreSQL)](#3-database--prisma-operations-postgresql)
4. [Machine Learning Operations](#4-machine-learning-operations)
5. [Dispute Operations & REST API Commands](#5-dispute-operations--rest-api-commands)
   * 5.1 [System Reliability Health Check](#51-system-reliability-health-check)
   * 5.2 [AI Model Evaluation Metrics](#52-ai-model-evaluation-metrics)
   * 5.3 [Judge Audit & Telemetry Export](#53-judge-audit--telemetry-export)
   * 5.4 [List All Active Disputes](#54-list-all-active-disputes)
   * 5.5 [Get Specific Case Details](#55-get-specific-case-details)
   * 5.6 [Trigger Shiprocket Live Tracking & POD Sync](#56-trigger-shiprocket-live-tracking--pod-sync)
   * 5.7 [Auto-Collect Evidence (All Connectors)](#57-auto-collect-evidence-all-connectors)
   * 5.8 [Sync Live Disputes from Razorpay API](#58-sync-live-disputes-from-razorpay-api)
   * 5.9 [Create a Manual Dispute Case](#59-create-a-manual-dispute-case)
   * 5.10 [Submit Reviewer Decision on a Case](#510-submit-reviewer-decision-on-a-case)
   * 5.11 [Execute Atomic Bulk Actions](#511-execute-atomic-bulk-actions)
   * 5.12 [Generate & Download Dispute Packet PDF](#512-generate--download-dispute-packet-pdf)
   * 5.13 [Submit Approved Dispute to Razorpay API](#513-submit-approved-dispute-to-razorpay-api)
   * 5.14 [Attach Evidence to a Case](#514-attach-evidence-to-a-case)
   * 5.15 [Detach Evidence from a Case](#515-detach-evidence-from-a-case)
   * 5.16 [Delete a Test Dispute Case](#516-delete-a-test-dispute-case)
   * 5.17 [View Financial Exposure Metrics](#517-view-financial-exposure-metrics)
   * 5.18 [View Merchant Profile](#518-view-merchant-profile)
6. [Webhook Simulation (HMAC-SHA256 Signed)](#6-webhook-simulation-hmac-sha256-signed)
7. [Cloud Deployment Verification (Render Production)](#7-cloud-deployment-verification-render-production)
8. [Git & GitHub Operations](#8-git--github-operations)
9. [Environment Setup & Configuration](#9-environment-setup--configuration)

---

## 1. Development & Server Lifecycle

```bash
# Start both Vite React UI (5173) and Express API (4000) concurrently
npm run dev

# Start only the Vite React Frontend (http://localhost:5173)
npm run dev:ui

# Start only the Express API Backend (http://localhost:4000)
npm run dev:api

# Start production server
npm run start

# Compile and bundle the production Vite frontend
npm run build

# Locally preview the production build
npm run preview
```

---

## 2. Automated Testing & Code Quality

```bash
# Run all 22 automated regression & security guardrail tests
npm test

# Run ESLint syntax & style validation
npm run lint

# Automatically fix fixable ESLint warnings
npm run lint:fix
```

---

## 3. Database & Prisma Operations (PostgreSQL)

```bash
# Regenerate Prisma client from schema.prisma
npm run db:generate

# Push schema changes directly to PostgreSQL (Aiven Cloud)
npm run db:push

# Create and apply database migrations
npm run db:migrate

# Seed baseline Razorpay dispute records
npm run db:seed

# Backfill multi-tenant merchant data ownership
npm run db:backfill-merchant

# Launch visual database management browser (Prisma Studio) on port 5555
npx prisma studio
```

---

## 4. Machine Learning Operations

```bash
# Train the 8-feature loss risk logistic regression model on historical disputes
# Computes holdout Precision (84.7%), Recall (95.7%), and F1 (0.898)
npm run train:model
```

---

## 5. Dispute Operations & REST API Commands

*Both **PowerShell** (Windows) and **cURL** (macOS / Linux) syntax are provided for every operation.*

### 5.1 System Reliability Health Check
Verifies webhook signature gates, database connection, and active connectors:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod http://localhost:4000/api/reliability
  ```
* **cURL:**
  ```bash
  curl -s http://localhost:4000/api/reliability | jq .
  ```

---

### 5.2 AI Model Evaluation Metrics
Returns the confusion matrix, Precision, Recall, and F1 Score:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod http://localhost:4000/api/evaluation
  ```
* **cURL:**
  ```bash
  curl -s http://localhost:4000/api/evaluation | jq .
  ```

---

### 5.3 Judge Audit & Telemetry Export
Produces the comprehensive, machine-readable architecture and live metrics export:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod http://localhost:4000/api/reliability/export
  ```
* **cURL:**
  ```bash
  curl -s http://localhost:4000/api/reliability/export | jq .
  ```

---

### 5.4 List All Active Disputes
Returns all merchant disputes sorted by risk score and SLA urgency:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod http://localhost:4000/api/cases
  ```
* **cURL:**
  ```bash
  curl -s http://localhost:4000/api/cases | jq .
  ```

---

### 5.5 Get Specific Case Details
Retrieves complete metadata, timeline events, evidence items, and audit logs for a single dispute:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod http://localhost:4000/api/cases/PP-2026-0001
  ```
* **cURL:**
  ```bash
  curl -s http://localhost:4000/api/cases/PP-2026-0001 | jq .
  ```

---

### 5.6 Trigger Shiprocket Live Tracking & POD Sync
Queries Shiprocket using an AWB code and auto-attaches Proof of Delivery to the case:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod `
    -Method POST `
    -Uri http://localhost:4000/api/connectors/shiprocket/sync `
    -ContentType "application/json" `
    -Body '{"caseId": "PP-2026-0007", "awbCode": "59629792084"}'
  ```
* **cURL:**
  ```bash
  curl -X POST http://localhost:4000/api/connectors/shiprocket/sync \
    -H "Content-Type: application/json" \
    -d '{"caseId": "PP-2026-0007", "awbCode": "59629792084"}'
  ```

---

### 5.7 Auto-Collect Evidence (All Connectors)
Runs parallel logistics, refund, and communication connectors for a dispute:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod `
    -Method POST `
    -Uri http://localhost:4000/api/cases/PP-2026-0001/auto-collect-evidence `
    -ContentType "application/json" `
    -Body '{}'
  ```
* **cURL:**
  ```bash
  curl -X POST http://localhost:4000/api/cases/PP-2026-0001/auto-collect-evidence \
    -H "Content-Type: application/json" \
    -d '{}'
  ```

---

### 5.8 Sync Live Disputes from Razorpay API
Reconciles disputes directly from Razorpay's live `/v1/disputes` endpoint:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod `
    -Method POST `
    -Uri http://localhost:4000/api/integrations/razorpay/sync-disputes `
    -ContentType "application/json" `
    -Body '{"count": 10}'
  ```
* **cURL:**
  ```bash
  curl -X POST http://localhost:4000/api/integrations/razorpay/sync-disputes \
    -H "Content-Type: application/json" \
    -d '{"count": 10}'
  ```

---

### 5.9 Create a Manual Dispute Case
Manually injects a dispute for evaluation and risk scoring:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod `
    -Method POST `
    -Uri http://localhost:4000/api/cases `
    -ContentType "application/json" `
    -Body '{
      "customer_name": "Vikram Malhotra",
      "customer_email": "vikram@example.com",
      "amount": 4999,
      "dispute_type": "goods_not_received",
      "customer_message": "Parcel was marked delivered but never received."
    }'
  ```
* **cURL:**
  ```bash
  curl -X POST http://localhost:4000/api/cases \
    -H "Content-Type: application/json" \
    -d '{
      "customer_name": "Vikram Malhotra",
      "customer_email": "vikram@example.com",
      "amount": 4999,
      "dispute_type": "goods_not_received",
      "customer_message": "Parcel was marked delivered but never received."
    }'
  ```

---

### 5.10 Submit Reviewer Decision on a Case
Records a human reviewer decision (`approved`, `escalated`, `accepted`):

* **PowerShell:**
  ```powershell
  Invoke-RestMethod `
    -Method POST `
    -Uri http://localhost:4000/api/cases/PP-2026-0001/decision `
    -ContentType "application/json" `
    -Body '{"decision": "approved", "reason": "Courier POD signature verified on file."}'
  ```
* **cURL:**
  ```bash
  curl -X POST http://localhost:4000/api/cases/PP-2026-0001/decision \
    -H "Content-Type: application/json" \
    -d '{"decision": "approved", "reason": "Courier POD signature verified on file."}'
  ```

---

### 5.11 Execute Atomic Bulk Actions
Executes batch operations (`approve`, `reject`, `assign`) across multiple cases in a transaction:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod `
    -Method POST `
    -Uri http://localhost:4000/api/cases/bulk-action `
    -ContentType "application/json" `
    -Body '{
      "caseIds": ["PP-2026-0002", "PP-2026-0003"],
      "action": "approve"
    }'
  ```
* **cURL:**
  ```bash
  curl -X POST http://localhost:4000/api/cases/bulk-action \
    -H "Content-Type: application/json" \
    -d '{
      "caseIds": ["PP-2026-0002", "PP-2026-0003"],
      "action": "approve"
    }'
  ```

---

### 5.12 Generate & Download Dispute Packet PDF
Generates and downloads the formal, server-side vector PDF defense dossier:

* **PowerShell:**
  ```powershell
  Invoke-WebRequest `
    -Method POST `
    -Uri http://localhost:4000/api/cases/PP-2026-0001/export-pdf `
    -OutFile .\PP-2026-0001-dispute-packet.pdf

  # Verify file downloaded
  Get-Item .\PP-2026-0001-dispute-packet.pdf | Select-Object Name, Length
  ```
* **cURL:**
  ```bash
  curl -X POST http://localhost:4000/api/cases/PP-2026-0001/export-pdf \
    --output PP-2026-0001-dispute-packet.pdf

  # Verify file downloaded
  ls -lh PP-2026-0001-dispute-packet.pdf
  ```

---

### 5.13 Submit Approved Dispute to Razorpay API
Submits the approved dispute defense packet directly to the Razorpay Dispute API:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod `
    -Method POST `
    -Uri http://localhost:4000/api/cases/PP-2026-0001/submit `
    -ContentType "application/json" `
    -Body '{"action": "contest", "summary": "Order delivered with verified courier POD."}'
  ```
* **cURL:**
  ```bash
  curl -X POST http://localhost:4000/api/cases/PP-2026-0001/submit \
    -H "Content-Type: application/json" \
    -d '{"action": "contest", "summary": "Order delivered with verified courier POD."}'
  ```

---

### 5.14 Attach Evidence to a Case
Attaches a verified document key (e.g. `invoice`, `customer communication`) to a dispute:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod `
    -Method PATCH `
    -Uri http://localhost:4000/api/cases/PP-2026-0001/evidence `
    -ContentType "application/json" `
    -Body '{"evidenceKey": "invoice"}'
  ```
* **cURL:**
  ```bash
  curl -X PATCH http://localhost:4000/api/cases/PP-2026-0001/evidence \
    -H "Content-Type: application/json" \
    -d '{"evidenceKey": "invoice"}'
  ```

---

### 5.15 Detach Evidence from a Case
Removes an evidence item and automatically recalculates the case readiness score:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod `
    -Method DELETE `
    -Uri http://localhost:4000/api/cases/PP-2026-0001/evidence/invoice
  ```
* **cURL:**
  ```bash
  curl -X DELETE http://localhost:4000/api/cases/PP-2026-0001/evidence/invoice
  ```

---

### 5.16 Delete a Test Dispute Case
Permanently deletes a manual test dispute case, including attached evidence and timeline records:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod `
    -Method DELETE `
    -Uri http://localhost:4000/api/cases/PP-2026-0007
  ```
* **cURL:**
  ```bash
  curl -X DELETE http://localhost:4000/api/cases/PP-2026-0007
  ```

---

### 5.17 View Financial Exposure Metrics
Returns real-time financial exposure, recoverable value, and review time savings:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod http://localhost:4000/api/metrics
  ```
* **cURL:**
  ```bash
  curl -s http://localhost:4000/api/metrics | jq .
  ```

---

### 5.18 View Merchant Profile
Returns the authenticated merchant's identity, email, and authentication subject:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod http://localhost:4000/api/merchant/profile
  ```
* **cURL:**
  ```bash
  curl -s http://localhost:4000/api/merchant/profile | jq .
  ```

---

## 6. Webhook Simulation (HMAC-SHA256 Signed)

Simulate a live Razorpay `payment.dispute.created` webhook event with valid HMAC-SHA256 signature verification using Node.js:

```bash
node -e "
import crypto from 'node:crypto';
import 'dotenv/config';

const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '8c271ae9fb2e71464691a0f35e09f260ffac954ed23374af2b4cc70776e98860';
const payload = JSON.stringify({
  entity: 'event',
  event: 'payment.dispute.created',
  contains: ['dispute', 'payment'],
  payload: {
    dispute: {
      entity: {
        id: 'disp_simulated_9901',
        payment_id: 'pay_Simulated8801',
        amount: 349900,
        currency: 'INR',
        status: 'open',
        reason_code: 'goods_not_received'
      }
    },
    payment: {
      entity: {
        id: 'pay_Simulated8801',
        amount: 349900,
        currency: 'INR',
        status: 'captured'
      }
    }
  }
});

const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

fetch('http://localhost:4000/api/webhooks/razorpay', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-razorpay-signature': signature
  },
  body: payload
})
.then(r => r.json())
.then(data => console.log('WEBHOOK INGESTION RESULT:', data))
.catch(err => console.error(err));
"
```

---

## 7. Cloud Deployment Verification (Render Production)

Test your live cloud production instance directly from any terminal:

```powershell
# 1. Cloud Telemetry & Architecture Export
Invoke-RestMethod https://proofpilot-ai.onrender.com/api/reliability/export

# 2. Cloud System Health & Connectors Status
Invoke-RestMethod https://proofpilot-ai.onrender.com/api/reliability

# 3. Cloud Loss Risk Model Performance Metrics
Invoke-RestMethod https://proofpilot-ai.onrender.com/api/evaluation

# 4. Cloud Service Status
Invoke-RestMethod https://proofpilot-ai.onrender.com/api/health
```

---

## 8. Git & GitHub Operations

```bash
# Check repository status
git status

# Stage all changes
git add .

# Create a commit
git commit -m "feat(core): your commit message"

# Push to origin main
git push origin main

# Pull latest remote changes
git pull origin main
```

---

## 9. Environment Setup & Configuration

```bash
# Copy example environment configuration
cp .env.example .env

# Verify Node version (v18+ required)
node -v

# Verify npm version (v9+ required)
npm -v
```
