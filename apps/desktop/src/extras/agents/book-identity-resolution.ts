import { randomUUID } from "node:crypto";
import {
  BookIdentityDesignContextSchema,
  CommandEnvelopeSchema,
  ExtrasAgentResolvedTaskSchema,
  createEnvelope,
  type ExtrasAgentTask,
  type ImageModelCapability
} from "@deepwrite/contracts";
import type { ExtrasAgentConfigStore } from "./config-store";
import {
  buildProjectBookSnapshot,
  type ChatRuntimeSources
} from "./chat/runtime-snapshot";
import type { ExtrasTaskResolution } from "./task-resolver";

type IdentityTask = Extract<
  ExtrasAgentTask,
  {
    agentId: "book-title-design" | "book-synopsis-design" | "book-cover-design";
  }
>;
export async function resolveBookIdentityTask(
  config: ExtrasAgentConfigStore,
  sources: ChatRuntimeSources,
  task: IdentityTask,
  capability?: ImageModelCapability
): Promise<ExtrasTaskResolution> {
  const profile = await config.resolve(task.agentId, task.profileId);
  const bookSnapshot = await buildProjectBookSnapshot(sources, task.input.book);
  const id = `cmd_identity_context_${randomUUID().replaceAll("-", "")}`;
  const contextResult = await sources.core(
    CommandEnvelopeSchema.parse(
      createEnvelope(
        "bookIdentity.readContext",
        {
          book: task.input.book,
          seedCandidateIds: task.input.seedCandidateIds
        },
        { id, correlationId: id }
      )
    )
  );
  if (contextResult.status !== "accepted")
    throw new Error(contextResult.error.message);
  const designContext = BookIdentityDesignContextSchema.parse(
    contextResult.payload
  );
  const roundId = `round_${randomUUID().replaceAll("-", "")}`;
  const imageCapability = capability ?? {
    aspectRatios: ["3:4", "2:3", "9:16", "1:1", "16:9"] as const,
    promptLanguage: "zh" as const,
    rendersCjkText: false
  };
  if (
    task.agentId === "book-cover-design" &&
    !imageCapability.aspectRatios.includes(task.input.aspectRatio)
  )
    throw new Error("当前图片服务不支持所选比例，请调整比例或图片模型。");
  const resolved = ExtrasAgentResolvedTaskSchema.parse({
    agentId: task.agentId,
    profile,
    input: {
      ...task.input,
      roundId,
      bookSnapshot,
      designContext,
      ...(task.agentId === "book-cover-design"
        ? {
            imageCapability,
            autoRender:
              task.input.autoRender ??
              ("autoRender" in profile ? profile.autoRender : true)
          }
        : {})
    }
  });
  if (
    resolved.agentId !== "book-title-design" &&
    resolved.agentId !== "book-synopsis-design" &&
    resolved.agentId !== "book-cover-design"
  )
    throw new Error("设计任务解析失败。");
  return {
    task: resolved,
    ...(task.input.book.projectType === "long"
      ? { resourceId: task.input.book.projectId }
      : {}),
    bookIdentity: {
      book: task.input.book,
      field:
        task.agentId === "book-title-design"
          ? "title"
          : task.agentId === "book-synopsis-design"
            ? "synopsis"
            : "cover",
      roundId,
      candidateCount: task.input.candidateCount,
      profile: { id: profile.id, name: profile.name },
      request: {
        candidateCount: task.input.candidateCount,
        ...(task.input.brief ? { brief: task.input.brief } : {}),
        seedCandidateIds: task.input.seedCandidateIds ?? [],
        ...(resolved.agentId === "book-cover-design"
          ? {
              imagesPerCandidate: resolved.input.imagesPerCandidate,
              aspectRatio: resolved.input.aspectRatio,
              titleRendering: resolved.input.titleRendering,
              autoRender:
                resolved.input.autoRender ?? resolved.profile.autoRender
            }
          : {})
      }
    }
  };
}
