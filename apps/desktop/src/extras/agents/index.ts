import type { BrowserWindow, Dialog } from "electron";
import type { CommandEnvelope, CommandResult } from "@deepwrite/contracts";
import { ExtrasAgentConfigStore } from "./config-store";
import { runExtrasAgent, type ExtrasAgentRunDependencies } from "./run-service";
import { handleLongBookSourceCommands } from "./sources/long-book-source-commands";
import { handleShortBookSourceCommands } from "./sources/short-book-source-commands";

export interface ExtrasAgentCommandContext extends Omit<
  ExtrasAgentRunDependencies,
  "configStore"
> {
  dialog: Pick<Dialog, "showOpenDialog">;
  getMainWindow(): BrowserWindow;
  getWorkspaceDirectory(): Promise<string | null>;
  core(command: CommandEnvelope): Promise<CommandResult>;
}

async function handleConfigCommand(
  configStore: ExtrasAgentConfigStore,
  command: CommandEnvelope
): Promise<CommandResult | undefined> {
  try {
    let payload: unknown;
    if (command.type === "extrasAgentConfig.list") {
      payload = await configStore.list(command.payload.agentId);
    } else if (command.type === "extrasAgentConfig.save") {
      payload = await configStore.save(command.payload);
    } else if (command.type === "extrasAgentConfig.reset") {
      payload = await configStore.reset(
        command.payload.agentId,
        command.payload.profileId
      );
    } else {
      return undefined;
    }
    return { status: "accepted", requestId: command.id, payload };
  } catch (error: unknown) {
    return {
      status: "rejected",
      requestId: command.id,
      error: {
        code: "extras_agent.settings_failed",
        message: error instanceof Error ? error.message : "更新分析预设失败。"
      }
    };
  }
}

/**
 * Main-side entry of the "更多功能" agent service: profile settings, runs,
 * and the source imports the analyses read from.
 */
export function createExtrasAgentService(userDataPath: string) {
  const configStore = new ExtrasAgentConfigStore(userDataPath);
  return {
    configStore,
    async handle(
      context: ExtrasAgentCommandContext,
      command: CommandEnvelope
    ): Promise<CommandResult | undefined> {
      if (command.type === "extrasAgent.run") {
        return runExtrasAgent(
          { ...context, configStore: () => configStore },
          command
        );
      }
      return (
        (await handleConfigCommand(configStore, command)) ??
        (await handleShortBookSourceCommands(context, command)) ??
        handleLongBookSourceCommands(context, command)
      );
    }
  };
}

export type ExtrasAgentService = ReturnType<typeof createExtrasAgentService>;
