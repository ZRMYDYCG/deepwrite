import type { ExtrasTaskAgentDefinition } from "../../definition";
import { identityBoundary, identityTools, identityUserMessage } from "./shared";
import { identityFaux } from "./faux";
export const bookSynopsisDesignAgent: ExtrasTaskAgentDefinition<"book-synopsis-design"> =
  {
    id: "book-synopsis-design",
    boundaryTitle: "简介设计",
    profilePrompt: "system",
    boundary: (task) => [
      ...identityBoundary(task),
      `简介目标 ${task.profile.targetLength} 字，允许上下浮动 20%，单份不超过 2000 字；${task.profile.includeHook ? "产出一句话钩子。" : "钩子可省略。"}简介须与已采用书名（无则作品名）呼应。每个候选包含可选 hook、text、angle、rationale。`
    ],
    tools: identityTools,
    userMessage: identityUserMessage,
    faux: identityFaux
  };
