import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type, type Static } from "@earendil-works/pi-ai";
import {
  SHORT_AGENT_SUBAGENT_SYSTEM_PROMPT_MAX_LENGTH,
  SUBAGENT_AUTHORING_OUTPUT_MODE_LABELS,
  SubagentAuthoringDraftSchema,
  type SubagentAuthoringDraft,
  type SubagentAuthoringRuntimeContext
} from "@deepwrite/contracts";
import { piStrictToolSampling } from "./pi-tool-schema";

export type SubagentAuthoringToolDetails = {
  kind: "subagent-authoring-draft-update";
  draft: SubagentAuthoringDraft;
};

type SubagentAuthoringToolResultDetails =
  { kind: "none" } | SubagentAuthoringToolDetails;

function textResult(
  text: string,
  details: SubagentAuthoringToolResultDetails = { kind: "none" }
): AgentToolResult<SubagentAuthoringToolResultDetails> {
  return { content: [{ type: "text", text }], details };
}

function defineTool<T extends ReturnType<typeof Type.Object>>(definition: {
  name: string;
  label: string;
  description: string;
  parameters: T;
  execute: (
    toolCallId: string,
    params: Static<T>,
    signal?: AbortSignal
  ) => Promise<AgentToolResult<SubagentAuthoringToolResultDetails>>;
}): AgentTool<T, SubagentAuthoringToolResultDetails> {
  return {
    name: definition.name,
    label: definition.label,
    description: definition.description,
    parameters: definition.parameters,
    ...piStrictToolSampling(definition.parameters),
    execute: definition.execute
  };
}

export function renderSubagentAuthoringSystemPrompt(
  context: SubagentAuthoringRuntimeContext
): string {
  const modeLabel = SUBAGENT_AUTHORING_OUTPUT_MODE_LABELS[context.outputMode];
  const skillLines = context.skills.map(
    (skill, index) =>
      `${index + 1}. id=${skill.id} · ${skill.libraryTitle} · ${skill.title}`
  );
  const existingNames = context.existingSubagentNames.length
    ? context.existingSubagentNames.map((name) => `- ${name}`).join("\n")
    : "（当前主智能体下还没有其它子智能体）";
  const outputGuidance =
    context.outputMode === "write"
      ? [
          "用户已确认：该子智能体应通过写入 / 替换工具直接修改工作区文档。",
          "「输出与交接」一节必须明确要求：先读后写、正文只能经工具落盘、交接摘要只说明改了什么与是否已产生待审阅变更，禁止用摘要代替写入。"
        ].join("\n")
      : [
          "用户已确认：该子智能体只把结论、问题清单或要点交回主智能体，不要直接改文档。",
          "「输出与交接」一节必须明确要求：可读工具可用于核对；不要调用写入 / 替换工具；交接摘要给出主智能体可继续处理的结论与要点，不要整段粘贴文件原文。"
        ].join("\n");

  return [
    "你是 DeepWrite 的「技能转子智能体」助手。根据用户选定的技能正文，为当前主智能体生成一份可保存的子智能体草稿。",
    "",
    `【目标主智能体】${context.parentAgentLabel}（${context.parentAgentId}）`,
    `【用户确认的产出方式】${modeLabel}`,
    outputGuidance,
    "",
    "【可选技能】",
    ...skillLines,
    "",
    "【当前同队已有子智能体名称】",
    existingNames,
    "",
    "【技能内容保真】",
    "- 不要改动技能的主要内容：技能里的方法、步骤、判断标准、约束与禁忌，保留原意与原有措辞，不总结、不扩写、不删减、不换说法，也不要加入技能里没有的新要求。",
    "- 除「输出与交接」外，其余部分只允许规范格式：统一标题层级、编号、列表与空行，不动文字含义。",
    "",
    "【systemPrompt 结构】",
    "1. 开头一两句说明身份与任务（「你是……子智能体，负责……」），只依据技能标题与用途概括，不引入新要求。",
    "2. 每条选定技能各占一节，标题写「## 技能：技能标题」，节内是该技能的原有内容，按选定顺序排列；多条技能之间不要合并或改写。",
    "3. 最后一节固定为「## 输出与交接」，这是唯一需要你改写的部分：把各技能里关于输出格式、交付物、交接、如何回复用户的描述并入此节，并按上面用户确认的产出方式调整，使其与子智能体的实际职责（不直接面对用户、结果交给主智能体或写入文档）一致。技能没有相关描述时，只写产出方式要求。",
    "",
    "工作流程：",
    "1. 先用 read_authoring_skill 读取全部选定技能正文，必要时可多次读取。",
    "2. 按上面的结构整理 systemPrompt：技能正文原样保留，只调整格式；只改写「输出与交接」。",
    "3. 子智能体运行时没有 load_skill，因此技能内容必须完整写进 systemPrompt，不能假设运行时还能加载技能。",
    `4. systemPrompt 不得超过 ${SHORT_AGENT_SUBAGENT_SYSTEM_PROMPT_MAX_LENGTH} 字。内容放不下时，只压缩重复表述与格式，不删除要求，并在最终回复中告知用户哪些技能被压缩。`,
    "5. 名称要简短且与同队已有名称不重复；能力说明写给主智能体看，说明何时委派。",
    "6. 完成后调用 write_subagent_draft 提交 name、description、systemPrompt；可多次调用覆盖草稿。",
    "7. 工具写入成功后，简短告知用户草稿已就绪，等待界面确认加入团队。"
  ].join("\n");
}

function buildListAuthoringSkillsTool(
  context: SubagentAuthoringRuntimeContext
): AgentTool {
  return defineTool({
    name: "list_authoring_skills",
    label: "列出选定技能",
    description: "列出本轮用户选定、可用于建设子智能体的技能 id、库名与标题。",
    parameters: Type.Object({}),
    execute: async () =>
      textResult(
        context.skills
          .map(
            (skill, index) =>
              `${index + 1}. id=${skill.id}\n库：${skill.libraryTitle}\n标题：${skill.title}\n字数：${skill.body.length}`
          )
          .join("\n\n")
      )
  });
}

function buildReadAuthoringSkillTool(
  context: SubagentAuthoringRuntimeContext
): AgentTool {
  return defineTool({
    name: "read_authoring_skill",
    label: "读取选定技能",
    description:
      "读取用户在本轮选定的技能正文。skill_id 必须来自 list_authoring_skills。",
    parameters: Type.Object({
      skill_id: Type.String({ minLength: 1, maxLength: 240 })
    }),
    execute: async (_toolCallId, params) => {
      const skillId = String(params.skill_id ?? "").trim();
      const skill = context.skills.find((item) => item.id === skillId);
      if (!skill) {
        return textResult(
          `未找到技能：${skillId}\n可用：${context.skills.map((item) => item.id).join(", ")}`
        );
      }
      return textResult(
        `【技能：${skill.libraryTitle} · ${skill.title}】\n\n${skill.body}`
      );
    }
  });
}

function buildWriteSubagentDraftTool(): AgentTool {
  return defineTool({
    name: "write_subagent_draft",
    label: "写入子智能体草稿",
    description:
      "把生成的子智能体草稿写入界面预览区。只更新预览，不会直接保存到智能体团队；用户确认后才会加入。",
    parameters: Type.Object({
      name: Type.String({ minLength: 1, maxLength: 80 }),
      description: Type.String({ minLength: 1, maxLength: 1_000 }),
      system_prompt: Type.String({ minLength: 1, maxLength: 20_000 })
    }),
    execute: async (_toolCallId, params) => {
      const draft = SubagentAuthoringDraftSchema.parse({
        name: String(params.name ?? "").trim(),
        description: String(params.description ?? "").trim(),
        systemPrompt: String(params.system_prompt ?? "").trim()
      });
      return textResult("已写入子智能体草稿预览，等待用户确认加入团队。", {
        kind: "subagent-authoring-draft-update",
        draft
      });
    }
  });
}

export function buildSubagentAuthoringTools(
  context: SubagentAuthoringRuntimeContext
): AgentTool[] {
  return [
    buildListAuthoringSkillsTool(context),
    buildReadAuthoringSkillTool(context),
    buildWriteSubagentDraftTool()
  ];
}

export function isSubagentAuthoringToolDetails(
  value: unknown
): value is SubagentAuthoringToolDetails {
  if (!value || typeof value !== "object" || !("kind" in value)) return false;
  const details = value as Record<string, unknown>;
  if (details.kind !== "subagent-authoring-draft-update") return false;
  return SubagentAuthoringDraftSchema.safeParse(details.draft).success;
}
