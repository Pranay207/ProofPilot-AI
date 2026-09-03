# ProofPilot-AI: Master Terminal Commands Reference

This document compiles every terminal command for running, testing, evaluating, and operating **ProofPilot-AI**.

---

## 1. Development & Server Lifecycle

### Start the Application (Concurrent Dev Mode)
Starts both the **Node.js Express Backend** (port 4000) and the **Vite React UI** (port 5173) in a single process:
```bash
npm run dev
```

### Start Services Individually
```bash
# Start only the Vite React Frontend (http://localhost:5173)
npm run dev:ui

# Start only the Express API Backend (http://localhost:4000)
npm run dev:api
```

### Production Build & Preview
```bash
# Compile and optimize the Vite production frontend bundle
npm run build

# Preview the compiled production build locally
npm run preview
```

---

## 2. Automated Testing & Code Quality

### Run Full Regression & Guardrails Test Suite (22 Tests)
Validates HMAC-SHA256 signatures, replay protection, AI fallbacks, evidence gates, and PDF generation:
```bash
npm test
```

### Linting & Formatting
```bash
# Check code for style and syntax issues
npm run lint

# Automatically fix fixable ESLint warnings
npm run lint:fix
```

---

## 3. Database & Prisma Operations (PostgreSQL)

### Regenerate Prisma Client
```bash
npm run db:generate
```

### Seed Baseline Demo Dispute Data
Inserts baseline Razorpay-style disputes into the database:
```bash
npm run db:seed
```

### Push Schema Updates to Cloud Database
```bash
npm run db:push
```

### Launch Visual Database Browser (Prisma Studio)
Opens a visual GUI at `http://localhost:5555` to view and edit tables:
```bash
npx prisma studio
```

---

## 4. Machine Learning Model Training

### Train Loss Risk Classifier
Trains the 8-feature logistic regression model on dispute data and computes holdout Precision/Recall/F1 metrics:
```bash
npm run train:model
```

---

## 5. Evaluator & API Verification Commands

Both **PowerShell** (Windows) and **cURL** (macOS / Linux) syntax are provided for every endpoint.

### 5.1 System Reliability Check
Verifies webhook signature gates, database connection, and active connectors:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod http://localhost:4000/api/reliability
  ```
* **cURL / Bash:**
  ```bash
  curl -s http://localhost:4000/api/reliability | jq .
  ```

---

### 5.2 AI Model Evaluation Metrics
Returns the confusion matrix, Precision (84.7%), Recall (95.7%), and F1 Score (0.898):

* **PowerShell:**
  ```powershell
  Invoke-RestMethod http://localhost:4000/api/evaluation
  ```
* **cURL / Bash:**
  ```bash
  curl -s http://localhost:4000/api/evaluation | jq .
  ```

---

### 5.3 Judge Audit & Telemetry Export
Produces the comprehensive, machine-readable system architecture and live metrics snapshot:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod http://localhost:4000/api/reliability/export
  ```
* **cURL / Bash:**
  ```bash
  curl -s http://localhost:4000/api/reliability/export | jq .
  ```

---

### 5.4 List All Active Disputes
Returns all merchant dispute records sorted by risk score and SLA urgency:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod http://localhost:4000/api/cases
  ```
* **cURL / Bash:**
  ```bash
  curl -s http://localhost:4000/api/cases | jq .
  ```

---

### 5.5 Trigger Direct Shiprocket Carrier Tracking & POD Sync
Interrogates the Shiprocket connector with an AWB code and auto-attaches Proof of Delivery to the case:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod `
    -Method POST `
    -Uri http://localhost:4000/api/connectors/shiprocket/sync `
    -ContentType "application/json" `
    -Body '{"caseId": "PP-2026-0007", "awbCode": "59629792084"}'
  ```
* **cURL / Bash:**
  ```bash
  curl -X POST http://localhost:4000/api/connectors/shiprocket/sync \
    -H "Content-Type: application/json" \
    -d '{"caseId": "PP-2026-0007", "awbCode": "59629792084"}'
  ```

---

### 5.6 Auto-Collect Evidence Across All Active Connectors
Runs parallel logistics, refund, and communication connectors for a specific dispute:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod `
    -Method POST `
    -Uri http://localhost:4000/api/cases/PP-2026-0001/auto-collect-evidence `
    -ContentType "application/json" `
    -Body '{}'
  ```
* **cURL / Bash:**
  ```bash
  curl -X POST http://localhost:4000/api/cases/PP-2026-0001/auto-collect-evidence \
    -H "Content-Type: application/json" \
    -d '{}'
  ```

---

### 5.7 Sync Live Disputes from Razorpay API
Polls the live Razorpay `/v1/disputes` endpoint using configured API credentials:

* **PowerShell:**
  ```powershell
  Invoke-RestMethod `
    -Method POST `
    -Uri http://localhost:4000/api/integrations/razorpay/sync-disputes `
    -ContentType "application/json" `
    -Body '{"count": 10}'
  ```
* **cURL / Bash:**
  ```bash
  curl -X POST http://localhost:4000/api/integrations/razorpay/sync-disputes \
    -H "Content-Type: application/json" \
    -d '{"count": 10}'
  ```

---

### 5.8 Generate & Download Dispute Defense PDF Packet
Compiles a server-side vector PDF packet (including invoice index, AWB milestones, POD, and audit log):

* **PowerShell:**
  ```powershell
  Invoke-WebRequest `
    -Method POST `
    -Uri http://localhost:4000/api/cases/PP-2026-0001/export-pdf `
    -OutFile .\PP-2026-0001-dispute-packet.pdf

  # Verify downloaded file
  Get-Item .\PP-2026-0001-dispute-packet.pdf | Select-Object Name, Length
  ```
* **cURL / Bash:**
  ```bash
  curl -X POST http://localhost:4000/api/cases/PP-2026-0001/export-pdf \
    --output PP-2026-0001-dispute-packet.pdf

  # Verify downloaded file
  ls -lh PP-2026-0001-dispute-packet.pdf
  ```

---

## 6. Live Cloud Verification Commands (Render Deployment)

Test your deployed cloud production instance directly:

### Check Cloud Telemetry Export
```powershell
Invoke-RestMethod https://proofpilot-ai.onrender.com/api/reliability/export
```

### Check Cloud System Reliability
```powershell
Invoke-RestMethod https://proofpilot-ai.onrender.com/api/reliability
```

### Check Cloud AI Evaluation Metrics
```powershell
Invoke-RestMethod https://proofpilot-ai.onrender.com/api/evaluation
```
