import { mkdirSync, writeFileSync } from "node:fs";

const FEATURE_NAMES = [
  "disputeBase",
  "amountLog",
  "missingRatio",
  "criticalMissingRatio",
  "deadlineUrgency",
  "statusMismatch",
  "complaintStrength",
  "evidenceReady",
];

const DISPUTE_BASE = {
  goods_not_received: 0.22,
  refund_not_processed: 0.18,
  duplicate_payment: 0.2,
  unauthorized_transaction: 0.34,
  product_not_as_described: 0.24,
  cancelled_subscription: 0.22,
};

const CRITICAL_COUNT = {
  goods_not_received: 2,
  refund_not_processed: 2,
  duplicate_payment: 2,
  unauthorized_transaction: 3,
  product_not_as_described: 3,
  cancelled_subscription: 3,
};

function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(207);

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function makeCase() {
  const types = Object.keys(DISPUTE_BASE);
  const type = types[Math.floor(random() * types.length)];
  const amount = Math.round(400 + random() ** 1.8 * 18000);
  const requiredCount = type === "product_not_as_described" ? 6 : 5;
  const missingCount = Math.floor(random() * (requiredCount + 1));
  const criticalCount = CRITICAL_COUNT[type] || 2;
  const criticalMissing = Math.min(criticalCount, Math.floor(random() * (criticalCount + 1)));
  const deadlineDays = Math.floor(random() * 14) + 1;
  const statusMismatch = random() > 0.52 ? 1 : 0;
  const complaintStrength = random() > 0.35 ? 1 : 0.35;
  const evidenceReady = missingCount === 0 ? 1 : 0;

  const features = {
    disputeBase: DISPUTE_BASE[type],
    amountLog: Math.min(1, Math.log10(Math.max(amount, 1)) / 5),
    missingRatio: missingCount / requiredCount,
    criticalMissingRatio: criticalMissing / criticalCount,
    deadlineUrgency: deadlineDays <= 1 ? 1 : deadlineDays <= 3 ? 0.85 : deadlineDays <= 7 ? 0.55 : 0.15,
    statusMismatch,
    complaintStrength,
    evidenceReady,
  };

  const hiddenLogit =
    -1.45 +
    features.disputeBase * 2.2 +
    features.amountLog * 0.35 +
    features.missingRatio * 1.85 +
    features.criticalMissingRatio * 1.55 +
    features.deadlineUrgency * 0.88 +
    features.statusMismatch * 0.72 +
    features.complaintStrength * 0.45 -
    features.evidenceReady * 0.85 +
    (random() - 0.5) * 0.25;

  return {
    x: FEATURE_NAMES.map((name) => features[name]),
    y: random() < sigmoid(hiddenLogit) ? 1 : 0,
  };
}

function trainLogisticRegression(rows) {
  const weights = new Array(FEATURE_NAMES.length).fill(0);
  let bias = 0;
  const rate = 0.18;
  const lambda = 0.002;

  // Class weight balancing (inverse-frequency weighting, matching scikit-learn class_weight="balanced")
  const nTotal = rows.length;
  const nPos = rows.filter((r) => r.y === 1).length;
  const nNeg = nTotal - nPos;
  const weightPos = nTotal / (2 * nPos);
  const weightNeg = nTotal / (2 * nNeg);

  for (let epoch = 0; epoch < 1000; epoch += 1) {
    const grad = new Array(weights.length).fill(0);
    let biasGrad = 0;
    for (const row of rows) {
      const z = bias + row.x.reduce((sum, value, index) => sum + value * weights[index], 0);
      const sampleWeight = row.y === 1 ? weightPos : weightNeg;
      const error = (sigmoid(z) - row.y) * sampleWeight;
      biasGrad += error;
      row.x.forEach((value, index) => {
        grad[index] += error * value + lambda * weights[index];
      });
    }
    bias -= (rate * biasGrad) / rows.length;
    weights.forEach((_, index) => {
      weights[index] -= (rate * grad[index]) / rows.length;
    });
  }

  return { bias, weights, weightPos, weightNeg };
}

function evaluate(model, rows) {
  const scored = rows.map((row) => {
    const z = model.bias + row.x.reduce((sum, value, index) => sum + value * model.weights[index], 0);
    const p = sigmoid(z);
    return { p, y: row.y, pred: p >= 0.5 ? 1 : 0 };
  });
  const tp = scored.filter((item) => item.pred === 1 && item.y === 1).length;
  const fp = scored.filter((item) => item.pred === 1 && item.y === 0).length;
  const tn = scored.filter((item) => item.pred === 0 && item.y === 0).length;
  const fn = scored.filter((item) => item.pred === 0 && item.y === 1).length;
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = (2 * precision * recall) / Math.max(0.0001, precision + recall);
  const accuracy = (tp + tn) / scored.length;
  return { precision, recall, f1, accuracy, confusion: { tp, fp, tn, fn } };
}

const dataset = Array.from({ length: 2400 }, makeCase);
const split = Math.floor(dataset.length * 0.8);
const train = dataset.slice(0, split);
const test = dataset.slice(split);

// 1. Compute Naive Baseline: Always predict positive (y = 1)
const naiveTp = test.filter((item) => item.y === 1).length;
const naiveFp = test.filter((item) => item.y === 0).length;
const naivePrecision = naiveTp / (naiveTp + naiveFp);
const naiveRecall = 1.0;
const naiveF1 = (2 * naivePrecision * naiveRecall) / (naivePrecision + naiveRecall);
const naiveAccuracy = naiveTp / test.length;

// 2. Train and evaluate class-weighted balanced model
const model = trainLogisticRegression(train);
const metrics = evaluate(model, test);
const weights = Object.fromEntries(FEATURE_NAMES.map((name, index) => [name, Number(model.weights[index].toFixed(6))]));

const artifact = {
  name: "ProofPilot Loss Risk v1",
  type: "trained logistic regression (class-weighted balanced)",
  training_source: "synthetic merchant dispute dataset shaped from payment-risk domain assumptions",
  production_note: "Trained with inverse-frequency class weighting to eliminate majority-class bias on imbalanced dispute data.",
  features: FEATURE_NAMES,
  bias: Number(model.bias.toFixed(6)),
  weights,
  validation: {
    precision: Number(metrics.precision.toFixed(3)),
    recall: Number(metrics.recall.toFixed(3)),
    f1: Number(metrics.f1.toFixed(3)),
    accuracy: Number(metrics.accuracy.toFixed(3)),
    holdout_rows: test.length,
    confusion: metrics.confusion,
    baseline_naive: {
      strategy: "always predict loss",
      accuracy: Number(naiveAccuracy.toFixed(3)),
      precision: Number(naivePrecision.toFixed(3)),
      recall: Number(naiveRecall.toFixed(3)),
      f1: Number(naiveF1.toFixed(3)),
    },
  },
  generated_at: new Date().toISOString(),
};

mkdirSync("src/model", { recursive: true });
writeFileSync("src/model/riskModelArtifact.js", `const riskModelArtifact = ${JSON.stringify(artifact, null, 2)};\n\nexport default riskModelArtifact;\n`);

console.log("=== NAIVE BASELINE (ALWAYS PREDICT LOSS) ===");
console.log({
  accuracy: `${(naiveAccuracy * 100).toFixed(1)}%`,
  precision: `${(naivePrecision * 100).toFixed(1)}%`,
  recall: `${(naiveRecall * 100).toFixed(1)}%`,
  f1: naiveF1.toFixed(3),
  confusion: { tp: naiveTp, fp: naiveFp, tn: 0, fn: 0 },
});

console.log("\n=== BALANCED CLASS-WEIGHTED MODEL ===");
console.log(`Trained ${artifact.name}`);
console.log(JSON.stringify(artifact.validation, null, 2));
