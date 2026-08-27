const riskModelArtifact = {
  "name": "ProofPilot Loss Risk v1",
  "type": "trained logistic regression",
  "training_source": "synthetic merchant dispute dataset shaped from payment-risk domain assumptions",
  "production_note": "Replace the generator with Razorpay historical dispute outcomes when private data is available.",
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
  "bias": -0.138213,
  "weights": {
    "disputeBase": 0.120787,
    "amountLog": -0.107463,
    "missingRatio": 1.311872,
    "criticalMissingRatio": 1.31478,
    "deadlineUrgency": 0.713067,
    "statusMismatch": 0.594842,
    "complaintStrength": 0.287026,
    "evidenceReady": -1.073003
  },
  "validation": {
    "precision": 0.847,
    "recall": 0.957,
    "f1": 0.898,
    "accuracy": 0.823,
    "holdout_rows": 480,
    "confusion": {
      "tp": 376,
      "fp": 68,
      "tn": 19,
      "fn": 17
    }
  },
  "generated_at": "2026-08-26T15:13:26.111Z"
};

export default riskModelArtifact;
