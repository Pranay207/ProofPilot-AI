const riskModelArtifact = {
  "name": "ProofPilot Loss Risk v1",
  "type": "trained logistic regression (class-weighted balanced)",
  "training_source": "synthetic merchant dispute dataset shaped from payment-risk domain assumptions",
  "production_note": "Trained with inverse-frequency class weighting to eliminate majority-class bias on imbalanced dispute data.",
  "features": [
    "disputeBase",
    "amountLog",
    "missingRatio",
    "criticalMissingRatio",
    "deadlineUrgency",
    "statusMismatch",
    "complaintStrength",
    "evidenceReady"
  ],
  "bias": -1.339096,
  "weights": {
    "disputeBase": 0.046718,
    "amountLog": -0.605882,
    "missingRatio": 1.494794,
    "criticalMissingRatio": 1.432836,
    "deadlineUrgency": 0.877217,
    "statusMismatch": 0.641798,
    "complaintStrength": 0.23519,
    "evidenceReady": -1.063928
  },
  "validation": {
    "precision": 0.91,
    "recall": 0.751,
    "f1": 0.823,
    "accuracy": 0.735,
    "holdout_rows": 480,
    "confusion": {
      "tp": 295,
      "fp": 29,
      "tn": 58,
      "fn": 98
    },
    "baseline_naive": {
      "strategy": "always predict loss",
      "accuracy": 0.819,
      "precision": 0.819,
      "recall": 1,
      "f1": 0.9
    }
  },
  "generated_at": "2026-09-04T05:46:40.834Z"
};

export default riskModelArtifact;
