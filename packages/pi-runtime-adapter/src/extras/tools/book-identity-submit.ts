import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import {
  BOOK_IDENTITY_CANDIDATE_JSON_SCHEMAS,
  BookIdentitySubmitInputSchema,
  BookIdentityRoundReceiptSchema,
  chatAssistantProjectKey,
  type ExtrasAgentResolvedTaskOf
} from "@deepwrite/contracts";
import type { ExtrasAgentRunServices } from "../definition";
import { defineStrictTool } from "./analysis-inputs";
import { extrasOutputResult } from "../output";

export type IdentityTask = ExtrasAgentResolvedTaskOf<
  "book-title-design" | "book-synopsis-design" | "book-cover-design"
>;
export function identityTaskField(task: IdentityTask) {
  return task.agentId === "book-title-design"
    ? "title"
    : task.agentId === "book-synopsis-design"
      ? "synopsis"
      : "cover";
}
export function buildBookIdentitySubmitTool(
  task: IdentityTask,
  services: ExtrasAgentRunServices
): AgentTool {
  const field = identityTaskField(task);
  const schema = BOOK_IDENTITY_CANDIDATE_JSON_SCHEMAS[field];
  let submitted = false;
  let submitting = false;
  return defineStrictTool({
    name: "submit_book_identity_candidates",
    label: "保存设计候选",
    description: `一次提交并保存恰好 ${task.input.candidateCount} 个候选。保存成功后才算完成。`,
    parameters: Type.Object({
      candidates: Type.Array(Type.Unsafe(schema), {
        minItems: task.input.candidateCount,
        maxItems: task.input.candidateCount
      })
    }),
    execute: async (_toolCallId, params) => {
      if (submitted || submitting)
        throw new Error("本次运行只能提交一次候选。");
      if (!services.bookIdentitySubmit)
        throw new Error("设计结果持久化提交桥不可用。");
      const input = BookIdentitySubmitInputSchema.parse({
        book: task.input.book,
        roundId: task.input.roundId,
        field,
        candidates: params.candidates
      });
      if (input.candidates.length !== task.input.candidateCount)
        throw new Error("候选数量与本次运行不一致。");
      submitting = true;
      try {
        const receipt = BookIdentityRoundReceiptSchema.parse(
          await services.bookIdentitySubmit(input)
        );
        if (receipt.roundId !== task.input.roundId)
          throw new Error("保存回执与本次轮次不一致。");
        submitted = true;
        return extrasOutputResult(
          { agentId: task.agentId, jobId: task.input.jobId },
          "候选已保存到作品目录。",
          {
            kind: "book-identity-round",
            field,
            roundId: receipt.roundId,
            bookKey: chatAssistantProjectKey(input.book),
            candidateCount: input.candidates.length,
            revision: receipt.revision
          }
        );
      } finally {
        submitting = false;
      }
    }
  });
}
