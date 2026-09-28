import {
  CHAT_PROJECT_DEFAULT_PROFILE_ID,
  ExtrasAgentResolvedTaskSchema,
  type ExtrasAgentResolvedTask,
  type ExtrasAgentTask
} from "@deepwrite/contracts";
import {
  buildChatProjectRuntimeSnapshot,
  buildChatRuntimeSnapshot,
  type ChatRuntimeSources
} from "./chat/runtime-snapshot";
import type { ExtrasAgentConfigStore } from "./config-store";

export interface ExtrasTaskResolution {
  task: ExtrasAgentResolvedTask;
  /** Long-form book the run may read through Main's Core query bridge. */
  resourceId?: string;
}

/**
 * Turns a Renderer task into what the Agent Utility runs: the saved profile
 * and, for chat, the snapshot Main alone is allowed to read.
 */
export async function resolveExtrasTask(
  configStore: ExtrasAgentConfigStore,
  chatSources: ChatRuntimeSources,
  task: ExtrasAgentTask
): Promise<ExtrasTaskResolution> {
  switch (task.agentId) {
    case "chat-normal":
      return {
        task: ExtrasAgentResolvedTaskSchema.parse({
          agentId: task.agentId,
          profile: await configStore.resolve(task.agentId, task.profileId),
          input: {
            ...task.input,
            runtime: await buildChatRuntimeSnapshot(chatSources)
          }
        })
      };
    case "chat-project": {
      // A project without its own prompt chats with the default prompt.
      const profile =
        (await configStore.find(task.agentId, task.profileId)) ??
        (await configStore.resolve(
          task.agentId,
          CHAT_PROJECT_DEFAULT_PROFILE_ID
        ));
      const { project } = task.input;
      return {
        task: ExtrasAgentResolvedTaskSchema.parse({
          agentId: task.agentId,
          profile,
          input: {
            ...task.input,
            runtime: await buildChatProjectRuntimeSnapshot(chatSources, project)
          }
        }),
        ...(project.projectType === "long"
          ? { resourceId: project.projectId }
          : {})
      };
    }
    default:
      return {
        task: ExtrasAgentResolvedTaskSchema.parse({
          agentId: task.agentId,
          profile: await configStore.resolve(task.agentId, task.profileId),
          input: task.input
        })
      };
  }
}
