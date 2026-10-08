import {
  AGENT_TEAM_MARKETPLACE_TEAM_MAX_BYTES,
  AGENT_TEAM_PROFILE_NAME_MAX_LENGTH,
  AgentTeamMarketplaceInstallResultSchema,
  AgentTeamMarketplaceLikeInputSchema,
  AgentTeamMarketplaceLikeResultSchema,
  AgentTeamMarketplaceListFilterSchema,
  AgentTeamMarketplacePublishInputSchema,
  AgentTeamMarketplaceSetEnabledInputSchema,
  AgentTeamMarketplaceUpdateInputSchema,
  AgentTeamProfileSchema,
  agentTeamMemberCount,
  withInheritedSubagentModels,
  type AgentTeamMarketplaceDetail,
  type AgentTeamMarketplaceInstallResult,
  type AgentTeamMarketplaceLikeInput,
  type AgentTeamMarketplaceListFilter,
  type AgentTeamMarketplacePage,
  type AgentTeamMarketplacePublishInput,
  type AgentTeamMarketplaceSetEnabledInput,
  type AgentTeamMarketplaceSummary,
  type AgentTeamMarketplaceTarget,
  type AgentTeamMarketplaceUpdateInput,
  type MarketplaceLikeResult
} from "@deepwrite/contracts";
import type { AgentTeamConfigStore } from "../../main/agent-team-config-store";
import type { MarketplaceRequestOptions } from "../../main/marketplace-request";
import {
  asRecord,
  MarketplaceClientError,
  requiredBoolean,
  requiredNumber
} from "../../main/marketplace-response";
import {
  normalizeTeamDetail,
  normalizeTeamPage,
  normalizeTeamSummary,
  teamFilterQuery,
  teamPath
} from "./wire";

/** The skill marketplace account client: its session signs every request. */
export interface AgentTeamMarketplaceRequester {
  request(
    method: string,
    path: string,
    options: MarketplaceRequestOptions
  ): Promise<unknown>;
}

export type AgentTeamMarketplaceStore = Pick<
  AgentTeamConfigStore,
  "list" | "exportProfile" | "installProfile"
>;

export class AgentTeamMarketplaceClient {
  constructor(
    private readonly requester: AgentTeamMarketplaceRequester,
    private readonly store: AgentTeamMarketplaceStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async list(
    filter: AgentTeamMarketplaceListFilter = {}
  ): Promise<AgentTeamMarketplacePage> {
    const query = teamFilterQuery(
      AgentTeamMarketplaceListFilterSchema.parse(filter)
    );
    return normalizeTeamPage(
      await this.requester.request("GET", `${teamPath()}${query}`, {
        authenticated: "optional"
      })
    );
  }

  async listMine(
    filter: AgentTeamMarketplaceListFilter = {}
  ): Promise<AgentTeamMarketplacePage> {
    const query = teamFilterQuery(
      AgentTeamMarketplaceListFilterSchema.parse(filter)
    );
    return normalizeTeamPage(
      await this.requester.request("GET", `/market/v1/me/agent-teams${query}`, {
        authenticated: true
      })
    );
  }

  async detail(
    target: AgentTeamMarketplaceTarget
  ): Promise<AgentTeamMarketplaceDetail> {
    return normalizeTeamDetail(
      await this.requester.request("GET", teamPath(target.id), {
        authenticated: "optional"
      })
    );
  }

  async myDetail(
    target: AgentTeamMarketplaceTarget
  ): Promise<AgentTeamMarketplaceDetail> {
    return normalizeTeamDetail(
      await this.requester.request(
        "GET",
        `/market/v1/me/agent-teams/${encodeURIComponent(target.id)}`,
        { authenticated: true }
      )
    );
  }

  async publish(
    input: AgentTeamMarketplacePublishInput
  ): Promise<AgentTeamMarketplaceDetail> {
    const body = await this.publicationBody(
      AgentTeamMarketplacePublishInputSchema.parse(input)
    );
    const detail = normalizeTeamDetail(
      await this.requester.request("POST", teamPath(), {
        authenticated: true,
        body
      })
    );
    if (detail.enabled) return detail;
    try {
      const enabled = await this.setEnabled({ id: detail.id, enabled: true });
      return { ...detail, ...enabled };
    } catch {
      // The upload succeeded; let the author enable it without publishing again.
      return detail;
    }
  }

  async update(
    input: AgentTeamMarketplaceUpdateInput
  ): Promise<AgentTeamMarketplaceDetail> {
    const parsed = AgentTeamMarketplaceUpdateInputSchema.parse(input);
    const body = await this.publicationBody(parsed);
    return normalizeTeamDetail(
      await this.requester.request("PUT", teamPath(parsed.id), {
        authenticated: true,
        body
      })
    );
  }

  async setEnabled(
    input: AgentTeamMarketplaceSetEnabledInput
  ): Promise<AgentTeamMarketplaceSummary> {
    const parsed = AgentTeamMarketplaceSetEnabledInputSchema.parse(input);
    return normalizeTeamSummary(
      await this.requester.request("PUT", teamPath(parsed.id, "enabled"), {
        authenticated: true,
        body: { enabled: parsed.enabled }
      })
    );
  }

  async delete(target: AgentTeamMarketplaceTarget): Promise<void> {
    await this.requester.request("DELETE", teamPath(target.id), {
      authenticated: true
    });
  }

  async like(
    input: AgentTeamMarketplaceLikeInput
  ): Promise<MarketplaceLikeResult> {
    const parsed = AgentTeamMarketplaceLikeInputSchema.parse(input);
    const data = asRecord(
      await this.requester.request(
        parsed.liked ? "POST" : "DELETE",
        teamPath(parsed.id, "like"),
        { authenticated: true }
      ),
      "点赞结果"
    );
    return AgentTeamMarketplaceLikeResultSchema.parse({
      liked: requiredBoolean(data, "liked"),
      likeCount: requiredNumber(data, "like_count")
    });
  }

  /** Installs the published version as a new local team. */
  async install(
    target: AgentTeamMarketplaceTarget
  ): Promise<AgentTeamMarketplaceInstallResult> {
    const detail = await this.detail(target);
    const installedCopy = (await this.store.list()).teams.find(
      (team) =>
        team.marketplaceSource?.teamId === detail.id &&
        team.marketplaceSource.version === detail.version
    );
    if (installedCopy) {
      throw new MarketplaceClientError(
        "agent_team_marketplace.already_installed",
        `该版本已安装为「${installedCopy.name}」。`
      );
    }
    const profile = AgentTeamProfileSchema.parse({
      id: "marketplace",
      name: detail.title.slice(0, AGENT_TEAM_PROFILE_NAME_MAX_LENGTH).trim(),
      workspaceType: detail.workspaceType,
      settings: withInheritedSubagentModels(detail.team)
    });
    const installed = await this.store.installProfile(profile, {
      teamId: detail.id,
      version: detail.version,
      installedAt: this.now().toISOString()
    });
    let downloadCounted = true;
    try {
      await this.requester.request("POST", teamPath(detail.id, "download"), {
        authenticated: false
      });
    } catch {
      downloadCounted = false;
    }
    return AgentTeamMarketplaceInstallResultSchema.parse({
      teamId: installed.team.id,
      teamName: installed.team.name,
      catalog: installed.catalog,
      downloadCounted
    });
  }

  /** Reads the saved team from Main's store; the Renderer only names it. */
  private async publicationBody(
    input: AgentTeamMarketplacePublishInput
  ): Promise<Record<string, unknown>> {
    const profile = await this.store.exportProfile({ teamId: input.teamId });
    const team = withInheritedSubagentModels(profile.settings);
    if (agentTeamMemberCount(team) === 0) {
      throw new MarketplaceClientError(
        "agent_team_marketplace.empty_team",
        "团队还没有子智能体，添加成员后再发布。"
      );
    }
    const bytes = Buffer.byteLength(JSON.stringify(team), "utf8");
    if (bytes > AGENT_TEAM_MARKETPLACE_TEAM_MAX_BYTES) {
      throw new MarketplaceClientError(
        "agent_team_marketplace.team_too_large",
        "团队配置超过 1 MB，精简成员提示词后再发布。"
      );
    }
    return {
      title: input.title,
      overview: input.overview,
      workspace_type: profile.workspaceType,
      team,
      metadata: { source: "deepwrite-desktop" }
    };
  }
}
