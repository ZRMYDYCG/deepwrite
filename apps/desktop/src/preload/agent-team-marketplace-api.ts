import { ipcRenderer } from "electron";
import * as C from "@deepwrite/contracts";

const invokeAgentTeamMarketplace = (request: unknown): Promise<unknown> =>
  ipcRenderer.invoke(
    C.AGENT_TEAM_MARKETPLACE_IPC_CHANNEL,
    C.AgentTeamMarketplaceIpcRequestSchema.parse(request)
  );

export const agentTeamMarketplace: C.DeepWriteApi["agentTeamMarketplace"] = {
  async list(filter = {}) {
    return C.AgentTeamMarketplacePageSchema.parse(
      await invokeAgentTeamMarketplace({ operation: "list", filter })
    );
  },
  async listMine(filter = {}) {
    return C.AgentTeamMarketplacePageSchema.parse(
      await invokeAgentTeamMarketplace({ operation: "listMine", filter })
    );
  },
  async detail(target) {
    return C.AgentTeamMarketplaceDetailSchema.parse(
      await invokeAgentTeamMarketplace({ operation: "detail", target })
    );
  },
  async myDetail(target) {
    return C.AgentTeamMarketplaceDetailSchema.parse(
      await invokeAgentTeamMarketplace({ operation: "myDetail", target })
    );
  },
  async publish(input) {
    return C.AgentTeamMarketplaceDetailSchema.parse(
      await invokeAgentTeamMarketplace({ operation: "publish", input })
    );
  },
  async update(input) {
    return C.AgentTeamMarketplaceDetailSchema.parse(
      await invokeAgentTeamMarketplace({ operation: "update", input })
    );
  },
  async setEnabled(input) {
    return C.AgentTeamMarketplaceSummarySchema.parse(
      await invokeAgentTeamMarketplace({ operation: "setEnabled", input })
    );
  },
  async delete(target) {
    await invokeAgentTeamMarketplace({ operation: "delete", target });
  },
  async like(input) {
    return C.AgentTeamMarketplaceLikeResultSchema.parse(
      await invokeAgentTeamMarketplace({ operation: "like", input })
    );
  },
  async install(target) {
    return C.AgentTeamMarketplaceInstallResultSchema.parse(
      await invokeAgentTeamMarketplace({ operation: "install", target })
    );
  }
};
