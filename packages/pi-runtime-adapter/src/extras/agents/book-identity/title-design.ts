import type { ExtrasTaskAgentDefinition } from "../../definition";
import { identityBoundary, identityTools, identityUserMessage } from "./shared";
import { identityFaux } from "./faux";
export const bookTitleDesignAgent: ExtrasTaskAgentDefinition<"book-title-design"> =
  {
    id: "book-title-design",
    boundaryTitle: "书名设计",
    profilePrompt: "system",
    boundary: (task) => [
      ...identityBoundary(task),
      `书名长度 ${task.profile.titleLength.min}–${task.profile.titleLength.max} 字；副标题策略 ${task.profile.subtitle}。每个候选包含 title、可选 subtitle、angle、rationale、keywords。`
    ],
    tools: identityTools,
    userMessage: identityUserMessage,
    faux: identityFaux
  };
