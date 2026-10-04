import {
  CatalogIndexSnapshotSchema,
  CatalogSnapshotSchema,
  ChatAssistantProjectRuntimeSnapshotSchema,
  ChatAssistantRuntimeSnapshotSchema,
  CommandEnvelopeSchema,
  LongListBooksResultSchema,
  ModelSettingsSchema,
  ModelUsageDashboardSchema,
  createEnvelope,
  type ChatAssistantProjectRef,
  type ChatAssistantProjectRuntimeSnapshot,
  type ChatAssistantRuntimeSnapshot,
  type CommandEnvelope,
  type CommandResult,
  type ModelUsageQueryInput
} from "@deepwrite/contracts";
import { createId } from "@deepwrite/shared";

/** Main services the chat snapshot is read from; all reads, no writes. */
export interface ChatRuntimeSources {
  core(command: CommandEnvelope): Promise<CommandResult>;
  listModels(): Promise<unknown>;
  queryUsage(query?: ModelUsageQueryInput): Promise<unknown>;
  appVersion(): string;
}

async function requireCorePayload(
  sources: ChatRuntimeSources,
  type: "catalog.index" | "catalog.snapshot" | "long.list",
  schema: { parse(value: unknown): unknown }
): Promise<unknown> {
  const id = createId(`cmd_chat_assistant_${type.replaceAll(".", "_")}`);
  const command = CommandEnvelopeSchema.parse(
    createEnvelope(type, {}, { id, correlationId: id })
  );
  const result = await sources.core(command);
  if (result.status === "rejected") {
    throw new Error(result.error.message);
  }
  return schema.parse(result.payload);
}

function usageStart(days: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (days > 1) date.setDate(date.getDate() - (days - 1));
  return date.toISOString();
}

/** The app facts every non-roleplay chat turn is grounded in. */
export async function buildChatRuntimeSnapshot(
  sources: ChatRuntimeSources
): Promise<ChatAssistantRuntimeSnapshot> {
  const [catalog, longList, settings, today, sevenDays, thirtyDays, all] =
    await Promise.all([
      requireCorePayload(sources, "catalog.index", CatalogIndexSnapshotSchema),
      requireCorePayload(sources, "long.list", LongListBooksResultSchema),
      sources.listModels(),
      sources.queryUsage({ startAt: usageStart(1) }),
      sources.queryUsage({ startAt: usageStart(7) }),
      sources.queryUsage({ startAt: usageStart(30) }),
      sources.queryUsage()
    ]);
  const modelSettings = ModelSettingsSchema.parse(settings);
  return ChatAssistantRuntimeSnapshotSchema.parse({
    software: {
      name: "DeepWrite",
      version: sources.appVersion(),
      platform: process.platform,
      arch: process.arch,
      currentTime: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    },
    catalog: CatalogIndexSnapshotSchema.parse(catalog),
    longBooks: LongListBooksResultSchema.parse(longList).books,
    // Redacted descriptors: credentials, URLs and routes never reach chat.
    models: modelSettings.models.map((model) => ({
      id: model.id,
      label: model.label,
      provider: model.provider,
      modelId: model.modelId,
      api: model.api,
      reasoning: model.reasoning,
      defaultThinkingLevel: model.defaultThinkingLevel,
      thinkingLevelOptions: model.thinkingLevelOptions,
      temperatureOptions: model.temperatureOptions,
      credentialConfigured: model.hasApiKey,
      ...(model.managedBy ? { managedBy: model.managedBy } : {}),
      ...(model.status !== undefined ? { status: model.status } : {}),
      ...(model.discount !== undefined ? { discount: model.discount } : {}),
      ...(model.input !== undefined ? { input: model.input } : {}),
      ...(model.output !== undefined ? { output: model.output } : {}),
      ...(model.cache !== undefined ? { cache: model.cache } : {})
    })),
    defaultModelId: modelSettings.defaultModelId,
    usage: {
      today: ModelUsageDashboardSchema.parse(today),
      "7d": ModelUsageDashboardSchema.parse(sevenDays),
      "30d": ModelUsageDashboardSchema.parse(thirtyDays),
      all: ModelUsageDashboardSchema.parse(all)
    }
  });
}

/** Shared book lookup used by chat and the three identity design tasks. */
export async function buildProjectBookSnapshot(
  sources: ChatRuntimeSources,
  project: ChatAssistantProjectRef
): Promise<ChatAssistantProjectRuntimeSnapshot["projectBook"]> {
  if (project.projectType === "long") {
    const books = LongListBooksResultSchema.parse(
      await requireCorePayload(sources, "long.list", LongListBooksResultSchema)
    ).books;
    const book = books.find((candidate) => candidate.id === project.projectId);
    if (!book)
      throw new Error("所选长篇项目不存在或暂时不可用，请刷新后重试。");
    return book;
  }
  const snapshot = CatalogSnapshotSchema.parse(
    await requireCorePayload(sources, "catalog.snapshot", CatalogSnapshotSchema)
  );
  const book = snapshot.books.find(
    (candidate) =>
      candidate.id === project.projectId &&
      candidate.bookType === project.projectType
  );
  if (!book) throw new Error("所选创作项目不存在或暂时不可用，请刷新后重试。");
  return book;
}

/** The snapshot plus the authoritative structure of the chat's project. */
export async function buildChatProjectRuntimeSnapshot(
  sources: ChatRuntimeSources,
  project: ChatAssistantProjectRef
): Promise<ChatAssistantProjectRuntimeSnapshot> {
  const [runtime, projectBook] = await Promise.all([
    buildChatRuntimeSnapshot(sources),
    buildProjectBookSnapshot(sources, project)
  ]);
  return ChatAssistantProjectRuntimeSnapshotSchema.parse({
    ...runtime,
    projectBook
  });
}
