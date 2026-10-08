import { ipcMain, type BrowserWindow } from "electron";
import {
  AGENT_TEAM_MARKETPLACE_IPC_CHANNEL,
  AgentTeamMarketplaceIpcRequestSchema,
  type AgentTeamMarketplaceIpcRequest
} from "@deepwrite/contracts";
import type { AgentTeamMarketplaceClient } from "./client";

export function registerAgentTeamMarketplaceIpc(
  getClient: () => AgentTeamMarketplaceClient | undefined,
  getMainWindow: () => BrowserWindow | null | undefined
): void {
  ipcMain.handle(
    AGENT_TEAM_MARKETPLACE_IPC_CHANNEL,
    async (event, rawRequest: unknown): Promise<unknown> => {
      const mainWindow = getMainWindow();
      if (
        !mainWindow ||
        mainWindow.isDestroyed() ||
        event.sender !== mainWindow.webContents
      ) {
        throw new Error("团队广场 IPC 请求来源无效。");
      }
      const client = getClient();
      if (!client) throw new Error("团队广场服务尚未初始化。");
      return dispatchAgentTeamMarketplace(
        client,
        AgentTeamMarketplaceIpcRequestSchema.parse(rawRequest)
      );
    }
  );
}

export async function dispatchAgentTeamMarketplace(
  client: AgentTeamMarketplaceClient,
  request: AgentTeamMarketplaceIpcRequest
): Promise<unknown> {
  switch (request.operation) {
    case "list":
      return client.list(request.filter);
    case "listMine":
      return client.listMine(request.filter);
    case "detail":
      return client.detail(request.target);
    case "myDetail":
      return client.myDetail(request.target);
    case "publish":
      return client.publish(request.input);
    case "update":
      return client.update(request.input);
    case "setEnabled":
      return client.setEnabled(request.input);
    case "delete":
      return client.delete(request.target);
    case "like":
      return client.like(request.input);
    case "install":
      return client.install(request.target);
  }
}
