import {
  CHAT_PROJECT_DEFAULT_PROFILE_ID,
  ChatAssistantProjectRefSchema,
  DEFAULT_CHAT_ASSISTANT_NORMAL_PROMPT,
  DEFAULT_CHAT_ASSISTANT_PROJECT_PROMPT,
  chatAssistantProjectKey
} from "@deepwrite/contracts";
import type { ExtrasAgentProfileCatalog } from "../profile-catalogs";

export const chatNormal: ExtrasAgentProfileCatalog<"chat-normal"> = {
  agentId: "chat-normal",
  defaults: [
    {
      id: "default",
      name: "普通聊天",
      description: "交流、解释和梳理想法，并按需查询作品目录与用量摘要。",
      systemPrompt: DEFAULT_CHAT_ASSISTANT_NORMAL_PROMPT
    }
  ],
  missingProfileMessage: "普通聊天配置已不存在，请重新打开聊天。"
};

/**
 * Pre-unification project file: `projects` lists the configured project
 * keys, `prompts` the customized prompts. A configured project without its
 * own prompt keeps the default prompt.
 */
function legacyChatProjects(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as {
    version?: unknown;
    projects?: unknown;
    prompts?: unknown;
  };
  if (candidate.version !== 1) return undefined;
  const prompts =
    candidate.prompts && typeof candidate.prompts === "object"
      ? (candidate.prompts as Record<string, unknown>)
      : {};
  const keys = new Set([
    ...(Array.isArray(candidate.projects) ? candidate.projects : []),
    ...Object.keys(prompts)
  ]);
  return [...keys].flatMap((key) => {
    if (typeof key !== "string") return [];
    const separator = key.indexOf(":");
    const project = ChatAssistantProjectRefSchema.safeParse({
      projectType: key.slice(0, separator),
      projectId: key.slice(separator + 1)
    });
    if (separator <= 0 || !project.success) return [];
    const prompt = prompts[key];
    return [
      {
        id: chatAssistantProjectKey(project.data),
        // The old file kept no titles; the chat page shows live book titles.
        name: project.data.projectId.slice(0, 256),
        project: project.data,
        systemPrompt:
          typeof prompt === "string" && prompt.trim()
            ? prompt
            : DEFAULT_CHAT_ASSISTANT_PROJECT_PROMPT
      }
    ];
  });
}

export const chatProject: ExtrasAgentProfileCatalog<"chat-project"> = {
  agentId: "chat-project",
  defaults: [
    {
      id: CHAT_PROJECT_DEFAULT_PROFILE_ID,
      name: "默认项目提示词",
      systemPrompt: DEFAULT_CHAT_ASSISTANT_PROJECT_PROMPT
    }
  ],
  missingProfileMessage: "项目聊天配置已不存在，请重新选择项目。",
  legacy: {
    path: ["config", "chat-assistant-projects.json"],
    profiles: legacyChatProjects
  }
};

export const chatRoleplay: ExtrasAgentProfileCatalog<"chat-roleplay"> = {
  agentId: "chat-roleplay",
  defaults: [],
  missingProfileMessage: "所选人物配置不存在，请重新选择人物。",
  legacy: {
    path: ["config", "chat-assistant-roleplay.json"],
    // The old file is the bare role list: `{ id, name, systemPrompt }[]`.
    profiles: (raw) => (Array.isArray(raw) ? raw : undefined)
  }
};
