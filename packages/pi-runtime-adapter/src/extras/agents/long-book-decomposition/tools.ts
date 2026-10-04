import { Type, StringEnum } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  DECOMPOSITION_CHILD_QUERY_LIMIT,
  DecompositionTopicPlanInputSchema,
  DecompositionQuerySchema,
  type DecompositionQuery,
  type ExtrasAgentResolvedTaskOf
} from "@deepwrite/contracts";
import type { ExtrasAgentRunServices } from "../../definition";
import { defineStrictTool, textToolResult } from "../../tools/analysis-inputs";
import type { DecompositionRole } from "./roles";

type Task = ExtrasAgentResolvedTaskOf<"long-book-decomposition">;
export function decompositionTopicTool(
  task: Task,
  services: ExtrasAgentRunServices
): AgentTool {
  return defineStrictTool({
    name: "plan_decomposition_topic",
    label: "登记专题",
    description:
      "只在整合或审校阶段登记有必要的补充专题，每包至多 5 个、每任务至多 20 个，且本包总单元不能超过 20。登记成功后必须分派 generalist 完成。",
    parameters: Type.Object({
      topicNumber: Type.Integer({ minimum: 1, maximum: 5 }),
      domain: StringEnum(["world", "character", "plot", "style"]),
      title: Type.String({ minLength: 1, maxLength: 120 }),
      dependencies: Type.Array(Type.String(), { maxItems: 20 })
    }),
    execute: async (_id, params) => {
      if (!services.decompositionPlanTopic)
        throw new Error("专题登记桥不可用。");
      const result = await services.decompositionPlanTopic(
        DecompositionTopicPlanInputSchema.parse({
          ...params,
          jobId: task.input.jobId,
          outputVersion: task.input.outputVersion,
          attemptId: task.input.attemptId
        })
      );
      task.input.units[result.unitId] = result.unit;
      if (!task.input.unitIds.includes(result.unitId))
        task.input.unitIds.push(result.unitId);
      return textToolResult(JSON.stringify(result), { kind: "none" });
    }
  });
}
const queries: Record<string, DecompositionQuery["kind"]> = {
  get_decomposition_status: "status",
  list_registry: "registry",
  read_card_digest: "cardDigest",
  read_chunk_text: "chunkText",
  search_source: "searchSource",
  read_cards: "cards",
  read_character_mentions: "characterMentions",
  read_world_mentions: "worldMentions",
  read_style_notes: "styleNotes",
  sample_passages: "samplePassages",
  read_assets: "assets"
};
const purposes: Record<string, string> = {
  get_decomposition_status: "读取工作包与单元状态",
  list_registry: "分页列出名册",
  read_card_digest: "读取章节梗概摘要",
  read_chunk_text: "按阅读块或章节范围读取原文",
  search_source: "在原文中按关键词检索（可限定章节范围），返回带章号的片段",
  read_cards: "按章节范围读取完整阅读记录",
  read_character_mentions: "按名册 registryId 读取人物的全部提及",
  read_world_mentions: "按 categoryId 读取设定类别的全部提及",
  read_style_notes: "读取文风观察",
  sample_passages: "按 strategy 抽样原文片段",
  read_assets: "读取已保存的成品（可按 unitId）"
};
/**
 * Children get their evidence with the task; these lookups only check a few
 * details. The set is fixed per role so every child of a role shares the
 * same request prefix.
 */
const roleQueries: Record<DecompositionRole, string[]> = {
  reader: [],
  registrar: ["search_source"],
  chronicler: ["search_source"],
  plot_architect: ["read_cards", "search_source"],
  character_archivist: ["read_character_mentions", "search_source"],
  world_archivist: ["read_world_mentions", "search_source"],
  style_analyst: ["sample_passages", "search_source"],
  continuity_keeper: ["read_chunk_text", "search_source"],
  reviewer: ["read_assets", "search_source"],
  generalist: Object.keys(queries).filter(
    (name) =>
      ![
        "get_decomposition_status",
        "list_registry",
        "read_chunk_text"
      ].includes(name)
  )
};
const parameters = Type.Object({
  unitId: Type.Optional(Type.String()),
  chunkId: Type.Optional(Type.String()),
  registryId: Type.Optional(Type.String()),
  categoryId: Type.Optional(Type.String()),
  query: Type.Optional(Type.String()),
  strategy: Type.Optional(
    StringEnum(["opening", "climax", "dialogue", "ending", "random"])
  ),
  cursor: Type.Optional(Type.Integer({ minimum: 0 })),
  range: Type.Optional(
    Type.Object({
      start: Type.Integer({ minimum: 1 }),
      end: Type.Integer({ minimum: 1 })
    })
  )
});
export function decompositionQueryTools(
  task: Task,
  services: ExtrasAgentRunServices,
  role?: DecompositionRole
): AgentTool[] {
  // One budget per child: lookups are for checking details, not for paging
  // through evidence the task already carries.
  let remaining = role ? DECOMPOSITION_CHILD_QUERY_LIMIT : Infinity;
  return (
    role
      ? roleQueries[role]
      : ["get_decomposition_status", "list_registry", "read_card_digest"]
  ).map((name) =>
    defineStrictTool({
      name,
      label: name,
      description: `${purposes[name]}。结果分页，每次最多 12,000 字，nextCursor 非空时可继续读取。${role ? `每个子任务的查询合计最多 ${DECOMPOSITION_CHILD_QUERY_LIMIT} 次。` : ""}`,
      parameters,
      execute: async (_id, params) => {
        if (!services.decompositionQuery) throw new Error("拆解查询桥不可用。");
        if (remaining <= 0)
          throw new Error(
            `本任务的补充查询次数已用完（${DECOMPOSITION_CHILD_QUERY_LIMIT} 次），请依据任务消息附带的材料完成提交。`
          );
        remaining--;
        const request = DecompositionQuerySchema.parse({
          ...params,
          ...(name === "get_decomposition_status" &&
          !params.unitId &&
          task.input.unitIds.length === 1
            ? { unitId: task.input.unitIds[0] }
            : {}),
          kind: queries[name]
        });
        const result = await services.decompositionQuery(
          task.input.jobId,
          request
        );
        return textToolResult(JSON.stringify(result), { kind: "none" });
      }
    })
  );
}

/** Fetches the whole evidence pack Core assembles for one child's units. */
export async function fetchDecompositionBrief(
  task: Task,
  services: ExtrasAgentRunServices,
  unitIds: string[]
): Promise<string> {
  if (!services.decompositionQuery) throw new Error("拆解查询桥不可用。");
  let text = "";
  let cursor: number | null = 0;
  do {
    const page: Awaited<
      ReturnType<NonNullable<ExtrasAgentRunServices["decompositionQuery"]>>
    > = await services.decompositionQuery(task.input.jobId, {
      kind: "brief",
      unitIds,
      ...(cursor ? { cursor } : {})
    });
    text += page.content;
    cursor = page.nextCursor;
  } while (cursor !== null);
  return text;
}
