import {
  DEFAULT_REVISION_METHOD,
  DEFAULT_STYLE_COMPARISON_METHOD,
  type ExtrasAgentId,
  type ExtrasAgentProfile
} from "@deepwrite/contracts";
import { chatNormal, chatProject, chatRoleplay } from "./chat/profile-catalogs";
import longCharacterPrompt from "./prompts/long-book-analysis/character.txt?raw";
import longPlotStructurePrompt from "./prompts/long-book-analysis/plot-structure.txt?raw";
import longStylePrompt from "./prompts/long-book-analysis/style.txt?raw";

export type StoredExtrasAgentProfile<A extends ExtrasAgentId> = Omit<
  ExtrasAgentProfile<A>,
  "builtin"
>;

/** Built-in profiles and pre-unification settings for one extras agent. */
export interface ExtrasAgentProfileCatalog<A extends ExtrasAgentId> {
  agentId: A;
  defaults: readonly StoredExtrasAgentProfile<A>[];
  missingProfileMessage: string;
  /**
   * The settings file this agent used before the unified store, relative to
   * userData. It is read once, when the unified file does not exist yet, and
   * left untouched on disk.
   */
  legacy?: {
    path: readonly string[];
    profiles(raw: unknown): unknown;
  };
}

function legacyPresets(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as { version?: unknown; presets?: unknown };
  return candidate.version === 1 ? candidate.presets : undefined;
}

const revisionAnalysis: ExtrasAgentProfileCatalog<"revision-analysis"> = {
  agentId: "revision-analysis",
  defaults: [
    {
      id: "default",
      name: "修改分析",
      description: "从修改前后的正文差异中提炼可复用的修改技能。",
      systemPrompt: DEFAULT_REVISION_METHOD
    }
  ],
  missingProfileMessage: "修改分析方法已不存在，请刷新后重试。",
  legacy: {
    path: ["revision-analysis-settings.json"],
    profiles: (raw) =>
      raw && typeof raw === "object" && "systemPrompt" in raw
        ? [
            {
              ...revisionAnalysis.defaults[0],
              systemPrompt: (raw as { systemPrompt: unknown }).systemPrompt
            }
          ]
        : undefined
  }
};

const shortBookAnalysis: ExtrasAgentProfileCatalog<"short-book-analysis"> = {
  agentId: "short-book-analysis",
  defaults: [
    {
      selectionMode: "single",
      id: "plot-structure",
      name: "剧情结构",
      description: "拆解短篇冲突、反转、节奏与完整结构。",
      systemPrompt:
        "你是短篇拆书分析师。分析整篇的开头钩子、核心冲突、情节递进、反转、高潮、结尾和节奏，提炼可复用结构。不要按章节拆分。多本输入时比较共性与差异，并标明书名证据。",
      output: { domain: "material", kind: "plot", stageId: "pacing" }
    },
    {
      selectionMode: "single",
      id: "character",
      name: "人物",
      description: "拆解人物目标、关系、功能、选择和阶段性弧光。",
      systemPrompt:
        "你是短篇拆书分析师。基于完整短篇，分析人物目标、冲突、关系、关键选择及人物弧光，提炼可复用的人物设计方法。多本输入时比较共性与差异，并标明书名证据。",
      output: { domain: "material", kind: "character", stageId: "character" }
    },
    {
      selectionMode: "single",
      id: "style",
      name: "文风",
      description: "提炼适用于短篇写作的行文规则与检查清单。",
      systemPrompt:
        "你是短篇拆书分析师。分析完整短篇的叙述视角、句式、用词、对白和描写，提炼可执行的写作规则及检查清单。多本输入时比较共性与差异，并标明书名证据。避免大段照抄正文。",
      output: {
        domain: "skill",
        kind: "style",
        stageId: "expert_section_writer"
      }
    }
  ],
  missingProfileMessage: "选择的短篇拆书预设已不存在，请刷新后重试。",
  legacy: {
    path: ["config", "short-book-analysis-presets.json"],
    profiles: legacyPresets
  }
};

const longBookAnalysis: ExtrasAgentProfileCatalog<"long-book-analysis"> = {
  agentId: "long-book-analysis",
  defaults: [
    {
      id: "plot-structure",
      name: "剧情结构",
      description: "拆解大剧情发展、章节级小剧情节拍与可复用结构模板。",
      systemPrompt: longPlotStructurePrompt,
      output: { domain: "material", kind: "plot", stageId: "pacing" }
    },
    {
      id: "character",
      name: "人物",
      description: "拆解人物目标、关系、功能、选择和阶段性弧光。",
      systemPrompt: longCharacterPrompt,
      output: { domain: "material", kind: "character", stageId: "character" }
    },
    {
      id: "style",
      name: "文风",
      description: "提炼可直接交给分节写手执行的行文规则与检查清单。",
      systemPrompt: longStylePrompt,
      output: {
        domain: "skill",
        kind: "style",
        stageId: "expert_section_writer"
      }
    }
  ],
  missingProfileMessage: "选择的长篇拆书预设已不存在，请刷新后重试。",
  legacy: {
    path: ["config", "long-book-analysis-presets.json"],
    profiles: legacyPresets
  }
};

// The previous comparison method lived in Renderer localStorage; the page
// imports it through `extrasAgentConfig.save` the first time it opens.
const styleComparison: ExtrasAgentProfileCatalog<"style-comparison"> = {
  agentId: "style-comparison",
  defaults: [
    {
      id: "default",
      name: "文风比对",
      description: "比较两份文本的文风，并给出有依据的相似度评分。",
      systemPrompt: DEFAULT_STYLE_COMPARISON_METHOD
    }
  ],
  missingProfileMessage: "文风比对方法已不存在，请刷新后重试。"
};

export const EXTRAS_AGENT_PROFILE_CATALOGS: {
  [A in ExtrasAgentId]: ExtrasAgentProfileCatalog<A>;
} = {
  "revision-analysis": revisionAnalysis,
  "short-book-analysis": shortBookAnalysis,
  "long-book-analysis": longBookAnalysis,
  "style-comparison": styleComparison,
  "chat-normal": chatNormal,
  "chat-project": chatProject,
  "chat-roleplay": chatRoleplay
};
