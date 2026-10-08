import type { RuntimeSubagentDefinition } from "../../../subagent-types";

export const DECOMPOSITION_ROLES = {
  reader: [
    "通读员",
    "一个任务负责一个阅读块（chunk:N）：阅读任务消息附带的整块原文，为块内每章或片段写完整阅读记录：梗概、人物事实、设定、剧情、伏笔和文风，批量提交。只记录有章节证据的事实。"
  ],
  registrar: [
    "名册员",
    "按编号给出名册决定：合并同一对象的称呼，人物按出场范围和情节分量分级，不能确定的对象保持分开；没写到的名字由系统各自建条。"
  ],
  chronicler: [
    "分卷编年员",
    "按因果组织剧情点，给出准确章节范围，保留转折、高潮和阶段结果。"
  ],
  plot_architect: [
    "剧情架构师",
    "根据编年段整理主线、核心梗、开篇和伏笔。伏笔触点只能描述已发生的动作；未揭示的真相不能编造。"
  ],
  character_archivist: [
    "人物档案师",
    "稳定特征写入核心档案，变化写入经历；最新状态以最后出场为准，关系变化注明章节。有分卷小传时以已保存小传为主合并。"
  ],
  world_archivist: [
    "设定整理师",
    "先类别概览再列条目。境界按层级排序，冲突说法都保留章节证据。"
  ],
  style_analyst: [
    "文风分析师",
    "分析视角、句式、节奏、对白、描写和章末手法；典型片段配点评，说明可迁移写法。"
  ],
  continuity_keeper: [
    "连续性记录员",
    "只整理最新一章结束时的场景、人物状态、未完成动作、紧迫悬念与语气，让下一章可直接接续。"
  ],
  reviewer: [
    "审校员",
    "核对人物与设定矛盾、主要人物缺档、伏笔状态。每个问题给章号和修复建议；一期一轮。"
  ],
  generalist: [
    "通用拆解员",
    "根据主控要求完成专项研究，按人物、世界观、剧情或文风提交专题成品。"
  ]
} as const;
export type DecompositionRole = keyof typeof DECOMPOSITION_ROLES;
export function decompositionRole(unitId: string): DecompositionRole {
  if (unitId.startsWith("chunk:") || unitId.startsWith("reading:"))
    return "reader";
  if (unitId.startsWith("registry:")) return "registrar";
  if (unitId.startsWith("chronicle:")) return "chronicler";
  if (unitId.startsWith("plot:")) return "plot_architect";
  if (unitId.startsWith("character:") || unitId.startsWith("character-volume:"))
    return "character_archivist";
  if (unitId.startsWith("world:")) return "world_archivist";
  if (unitId.startsWith("style:")) return "style_analyst";
  if (unitId.startsWith("continuity:")) return "continuity_keeper";
  if (unitId.startsWith("review:")) return "reviewer";
  return "generalist";
}
export function decompositionRoleDefinitions(): RuntimeSubagentDefinition[] {
  return Object.entries(DECOMPOSITION_ROLES).map(
    ([id, [name, description]]) => ({
      id,
      name,
      description,
      systemPrompt: description,
      enabled: true,
      modelMode: "inherit"
    })
  );
}
