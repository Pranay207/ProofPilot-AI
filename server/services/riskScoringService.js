import { scoreCase } from "../../src/lib/ruleEngine.js";
import { buildAiJudgment } from "../ml/classifier.js";
import { buildWorkflowSnapshot } from "../../src/lib/workflow.js";

export function scoreAndClassifyCase(caseItem) {
  const scored = { ...caseItem, ...scoreCase(caseItem) };
  return {
    ...scored,
    ai_judgment: buildAiJudgment(scored),
    workflow: buildWorkflowSnapshot(scored),
  };
}

