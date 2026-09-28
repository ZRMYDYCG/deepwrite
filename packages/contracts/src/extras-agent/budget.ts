import { assertRevisionAnalysisBudget } from "../revision-analysis-budget";
import { assertShortAnalysisBudget } from "../short-book-analysis-budget";
import { assertStyleComparisonBudget } from "../style-comparison";
import type { ExtrasAgentResolvedTask } from "./tasks";

interface ModelCapacity {
  contextWindow?: number | undefined;
  maxTokens?: number | undefined;
}

/**
 * Rejects inputs that cannot fit the model without truncation. Renderer runs
 * it for early feedback; Main and the Agent Utility re-check authoritatively.
 */
export function assertExtrasAgentBudget(
  task: ExtrasAgentResolvedTask,
  model: ModelCapacity | undefined
): void {
  switch (task.agentId) {
    case "revision-analysis":
      if (!model) throw new Error("请选择可用模型。");
      assertRevisionAnalysisBudget(task.input, task.profile, model);
      return;
    case "short-book-analysis":
      if (!model) throw new Error("请选择可用模型。");
      assertShortAnalysisBudget(task.input, task.profile, model);
      return;
    case "long-book-analysis":
      // The Renderer pipeline sizes each batch to the model before sending it.
      return;
    case "style-comparison":
      if (model) assertStyleComparisonBudget(task.input, task.profile, model);
      return;
    case "chat-normal":
    case "chat-project":
    case "chat-roleplay":
      // Chat history is bounded by the conversation schema instead.
      return;
  }
}
