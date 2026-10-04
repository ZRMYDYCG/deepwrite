import { randomUUID } from "node:crypto";
import {
  CommandEnvelopeSchema,
  createEnvelope,
  LongBookDecompositionJobSchema,
  LongBookAnalysisSourceSchema,
  DecompositionSourceConfirmationSchema,
  splitDecompositionChunks,
  estimateDecomposition,
  decompositionInputBudget,
  type CommandEnvelope,
  type CommandResult,
  type DecompositionControlInput,
  type LongBookDecompositionJob
} from "@deepwrite/contracts";
import {
  workspaceResourceParent,
  workspaceGroupParent
} from "../../../main/ipc/workspace-paths";
import type { ExtrasAgentCommandContext } from "../index";
import type { ExtrasAgentConfigStore } from "../config-store";
import { decompositionModelCapacity } from "./model-capacity";
import {
  restoreDecompositionUsage,
  takeDecompositionUsage
} from "../../../main/decomposition-usage";

export async function decompositionCore(
  context: Pick<ExtrasAgentCommandContext, "core" | "getWorkspaceDirectory">,
  command: CommandEnvelope,
  payload: Record<string, unknown>,
  type = "longBookDecomposition.coreAccess"
): Promise<CommandResult> {
  const workspaceDirectory = await context.getWorkspaceDirectory();
  if (!workspaceDirectory) throw new Error("请先在设置中选择工作目录。");
  const result = await context.core(
    CommandEnvelopeSchema.parse(
      createEnvelope(
        type,
        { workspaceDirectory, ...payload },
        { id: `${command.id}-core`, context: command.context }
      )
    )
  );
  return { ...result, requestId: command.id };
}
/** Control calls carry the usage Main observed since the previous one. */
export async function controlWithUsage(
  context: Pick<ExtrasAgentCommandContext, "core" | "getWorkspaceDirectory">,
  command: CommandEnvelope,
  control: DecompositionControlInput
): Promise<CommandResult> {
  const usage = takeDecompositionUsage(control.jobId);
  try {
    const result = await decompositionCore(context, command, {
      operation: "control",
      jobId: control.jobId,
      control,
      ...(usage ? { usage } : {})
    });
    if (result.status !== "accepted" && usage)
      restoreDecompositionUsage(control.jobId, usage);
    return result;
  } catch (error) {
    if (usage) restoreDecompositionUsage(control.jobId, usage);
    throw error;
  }
}
export async function handleDecompositionCommands(
  context: ExtrasAgentCommandContext,
  config: ExtrasAgentConfigStore,
  command: CommandEnvelope
): Promise<CommandResult | undefined> {
  if (
    !command.type.startsWith("longBookDecomposition.") ||
    command.type === "longBookDecomposition.coreCreate" ||
    command.type === "longBookDecomposition.coreAccess" ||
    command.type === "longBookDecomposition.query" ||
    command.type === "longBookDecomposition.submitUnit" ||
    command.type === "longBookDecomposition.planTopic"
  )
    return undefined;
  try {
    if (command.type === "longBookDecomposition.createJob") {
      const {
        confirmation,
        models,
        mode,
        targetSelection,
        autoContinue,
        profileId,
        reuseJobId
      } = command.payload;
      const sourceResult = await decompositionCore(
        context,
        command,
        {
          operation: "confirmed",
          sourceId: confirmation.sourceId,
          sourceRevision: confirmation.sourceRevision,
          confirmationId: confirmation.id
        },
        "longBookAnalysis.coreSource"
      );
      if (sourceResult.status !== "accepted") return sourceResult;
      const raw = sourceResult.payload as {
        source: unknown;
        confirmation: unknown;
      };
      const source = LongBookAnalysisSourceSchema.parse(raw.source);
      const persisted = DecompositionSourceConfirmationSchema.parse(
        raw.confirmation
      );
      if (
        JSON.stringify(persisted) !== JSON.stringify(confirmation) ||
        source.fingerprint !== persisted.fingerprint
      )
        throw new Error("来源与持久化确认回执不一致。");
      const chapters = source.chapters.filter(
        ({ order }) =>
          order >= persisted.range.start && order <= persisted.range.end
      );
      const characterCount = chapters.reduce(
        (sum, { text }) => sum + text.length,
        0
      );
      if (characterCount > 20_000_000)
        throw new Error("单任务正文超过 2,000 万字，请缩小章节范围。");
      const profile = await config.resolve(
        "long-book-decomposition",
        profileId
      );
      const configs = await Promise.all([
        context.resolveModel(models.reading.modelId),
        context.resolveModel(models.integration.modelId)
      ]);
      const capacities = await Promise.all(
        configs.map(async (model, index) => {
          if (!model) {
            if (!context.evaluationMode)
              throw new Error("拆解模型不可用，请重新选择。");
            return { contextWindow: 128_000, maxTokens: 8192 };
          }
          const capacity = await decompositionModelCapacity(
            context.requestAgent,
            command,
            model,
            String(index)
          );
          decompositionInputBudget(capacity, profile.systemPrompt.length);
          return {
            contextWindow: capacity.contextWindow,
            maxTokens: capacity.maxTokens
          };
        })
      );
      const capacity = (index: number) => capacities[index]!;
      const chunks = splitDecompositionChunks(
        chapters,
        capacity(0),
        profile.systemPrompt.length
      );
      estimateDecomposition(chapters.length, characterCount, chunks.length);
      const now = new Date().toISOString();
      const job: LongBookDecompositionJob =
        LongBookDecompositionJobSchema.parse({
          schemaVersion: 1,
          id: `ldjob_${randomUUID().replaceAll("-", "")}`,
          createdAt: now,
          updatedAt: now,
          mode,
          outputVersion: 1,
          targetSelection,
          source: {
            sourceId: source.id,
            sourceRevision: persisted.sourceRevision,
            title: source.name,
            fingerprint: persisted.fingerprint,
            confirmationId: persisted.id,
            confirmedAt: persisted.confirmedAt,
            chapterCount: chapters.length,
            characterCount,
            range: persisted.range
          },
          profile,
          models: {
            reading: { ...models.reading, ...capacity(0) },
            integration: { ...models.integration, ...capacity(1) }
          },
          chunks,
          chronicleSegments: [],
          phase: "prepare_target",
          status: "idle",
          autoContinue,
          units: {},
          ...(reuseJobId ? { reusedFromJobId: reuseJobId } : {})
        });
      const workspace = await context.getWorkspaceDirectory();
      if (!workspace) throw new Error("工作目录不存在。");
      return decompositionCore(
        context,
        command,
        {
          job,
          paths: {
            book: workspaceResourceParent(workspace, "book"),
            materials: workspaceResourceParent(workspace, "material"),
            groups: workspaceGroupParent(workspace, "material")
          }
        },
        "longBookDecomposition.coreCreate"
      );
    }
    if (command.type === "longBookDecomposition.listJobs")
      return decompositionCore(context, command, { operation: "list" });
    if (command.type === "longBookDecomposition.getJob")
      return decompositionCore(context, command, {
        operation: "get",
        jobId: command.payload.jobId,
        recover: ![...context.activeRuns.values()].some(
          (run) => run.decompositionJobId === command.payload.jobId
        )
      });
    if (command.type === "longBookDecomposition.control")
      return controlWithUsage(context, command, command.payload);
    if (command.type === "longBookDecomposition.getRegistry")
      return decompositionCore(context, command, {
        operation: "registry",
        jobId: command.payload.jobId
      });
    if (command.type === "longBookDecomposition.saveRegistry")
      return decompositionCore(context, command, {
        operation: "save-registry",
        jobId: command.payload.jobId,
        registry: command.payload
      });
    if (command.type === "longBookDecomposition.listResults")
      return decompositionCore(context, command, {
        operation: "results",
        jobId: command.payload.jobId
      });
    if (command.type === "longBookDecomposition.readUnit")
      return decompositionCore(context, command, {
        operation: "unit",
        jobId: command.payload.jobId,
        unitId: command.payload.unitId
      });
    return undefined;
  } catch (error) {
    return {
      status: "rejected",
      requestId: command.id,
      error: {
        code: "decomposition.command_failed",
        message: error instanceof Error ? error.message : "拆解操作失败。"
      }
    };
  }
}
