import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_TEAM_MARKETPLACE_TEAM_MAX_BYTES,
  DEFAULT_AGENT_TEAM_SETTINGS,
  type AgentTeamSettings,
  type ShortAgentSubagentDefinition
} from "@deepwrite/contracts";
import { AgentTeamConfigStore } from "../../main/agent-team-config-store";
import type { MarketplaceRequestOptions } from "../../main/marketplace-request";
import { MarketplaceClientError } from "../../main/marketplace-response";
import { AgentTeamMarketplaceClient } from "./client";

const roots = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...roots].map((root) => rm(root, { recursive: true, force: true }))
  );
  roots.clear();
});

async function createStore(): Promise<AgentTeamConfigStore> {
  const root = await mkdtemp(join(tmpdir(), "deepwrite-team-plaza-"));
  roots.add(root);
  return new AgentTeamConfigStore(root);
}

const plotter: ShortAgentSubagentDefinition = {
  id: "plotter",
  name: "构思",
  description: "负责构思情节",
  systemPrompt: "你负责构思情节。",
  enabled: true,
  agentMode: "pure-read",
  modelMode: "custom",
  modelId: "author-local-model",
  thinkingLevel: "high",
  draw: {
    enabled: true,
    count: 3,
    selection: "auto",
    evaluator: {
      modelMode: "custom",
      modelId: "author-judge",
      thinkingLevel: "off",
      temperature: 0.4
    }
  }
};
const polisher: ShortAgentSubagentDefinition = {
  id: "polisher",
  name: "润色",
  description: "负责润色",
  systemPrompt: "你负责润色正文。",
  enabled: true,
  agentMode: "standard",
  modelMode: "inherit"
};

function shortTeam(
  members: ShortAgentSubagentDefinition[] = [plotter, polisher]
): AgentTeamSettings {
  return {
    ...structuredClone(DEFAULT_AGENT_TEAM_SETTINGS),
    parallelSubagents: true,
    teams: [{ parentAgentId: "short", subagents: members }]
  };
}

function remoteTeam(overrides: Record<string, unknown> = {}) {
  return {
    id: "remote-team",
    owner_user_id: "author",
    title: "短篇双人团队",
    overview: "构思与润色",
    workspace_type: "short",
    member_count: 2,
    version: 3,
    visibility: "public",
    status: "published",
    enabled: true,
    download_count: 4,
    like_count: 1,
    liked_by_me: false,
    owner_username: "writer",
    owner_name: "作者",
    owner_avatar_url: "",
    metadata: {},
    published_at: "2030-01-01T00:00:00Z",
    created_at: "2030-01-01T00:00:00Z",
    updated_at: "2030-01-02T00:00:00.123Z",
    team: shortTeam(),
    ...overrides
  };
}

interface RecordedRequest {
  method: string;
  path: string;
  options: MarketplaceRequestOptions;
}

function fakeServer(
  respond: (request: RecordedRequest) => unknown = () => remoteTeam()
) {
  const requests: RecordedRequest[] = [];
  return {
    requests,
    async request(
      method: string,
      path: string,
      options: MarketplaceRequestOptions
    ): Promise<unknown> {
      const request = { method, path, options };
      requests.push(request);
      return respond(request);
    }
  };
}

async function storeWithTeam(settings = shortTeam()) {
  const store = await createStore();
  const team = (await store.list()).teams.find(
    (candidate) => candidate.workspaceType === "short"
  )!;
  await store.save({ teamId: team.id, settings });
  return { store, team };
}

describe("agent team marketplace client", () => {
  it("publishes the whole saved team and drops model bindings of this machine", async () => {
    const { store, team } = await storeWithTeam();
    const server = fakeServer();
    const client = new AgentTeamMarketplaceClient(server, store);

    const detail = await client.publish({
      teamId: team.id,
      title: "短篇双人团队",
      overview: "构思与润色"
    });

    expect(detail).toMatchObject({
      id: "remote-team",
      memberCount: 2,
      enabled: true
    });
    expect(server.requests).toHaveLength(1);
    const [request] = server.requests;
    expect(request).toMatchObject({
      method: "POST",
      path: "/market/v1/agent-teams",
      options: { authenticated: true }
    });
    const body = request!.options.body as {
      workspace_type: string;
      team: AgentTeamSettings;
    };
    expect(body.workspace_type).toBe("short");
    expect(body.team.parallelSubagents).toBe(true);
    const [published] = body.team.teams[0]!.subagents;
    expect(published).toMatchObject({ id: "plotter", modelMode: "inherit" });
    expect(published).not.toHaveProperty("modelId");
    expect(published).not.toHaveProperty("thinkingLevel");
    expect(published!.draw?.evaluator).toEqual({ modelMode: "inherit" });
    expect(JSON.stringify(body)).not.toContain("author-local-model");
  });

  it("enables a newly uploaded team before approval and returns the saved visibility", async () => {
    const { store, team } = await storeWithTeam();
    const { team: settings, ...enabledSummary } = remoteTeam({
      status: "pending",
      updated_at: "2030-01-03T00:00:00Z"
    });
    const server = fakeServer(({ path }) =>
      path.endsWith("/enabled")
        ? enabledSummary
        : remoteTeam({ status: "pending", enabled: false })
    );

    const detail = await new AgentTeamMarketplaceClient(server, store).publish({
      teamId: team.id,
      title: "短篇双人团队",
      overview: "构思与润色"
    });

    expect(detail).toMatchObject({
      id: "remote-team",
      enabled: true,
      status: "pending",
      updatedAt: "2030-01-03T00:00:00Z",
      team: settings
    });
    expect(
      server.requests.map(({ method, path }) => ({ method, path }))
    ).toEqual([
      { method: "POST", path: "/market/v1/agent-teams" },
      { method: "PUT", path: "/market/v1/agent-teams/remote-team/enabled" }
    ]);
    expect(server.requests[1]!.options).toEqual({
      authenticated: true,
      body: { enabled: true }
    });
  });

  it("keeps the uploaded team when automatic enabling fails without uploading again", async () => {
    const { store, team } = await storeWithTeam();
    const server = fakeServer(({ path }) => {
      if (path.endsWith("/enabled")) throw new Error("offline");
      return remoteTeam({ enabled: false, status: "pending" });
    });

    const detail = await new AgentTeamMarketplaceClient(server, store).publish({
      teamId: team.id,
      title: "短篇双人团队",
      overview: "构思与润色"
    });

    expect(detail).toMatchObject({
      id: "remote-team",
      enabled: false,
      status: "pending"
    });
    expect(server.requests).toHaveLength(2);
    expect(
      server.requests.filter(({ method }) => method === "POST")
    ).toHaveLength(1);
  });

  it("preserves a manually disabled team's visibility when updating its version", async () => {
    const { store, team } = await storeWithTeam();
    const server = fakeServer(() =>
      remoteTeam({ enabled: false, status: "pending" })
    );

    const detail = await new AgentTeamMarketplaceClient(server, store).update({
      id: "remote-team",
      teamId: team.id,
      title: "短篇双人团队",
      overview: "构思与润色"
    });

    expect(detail).toMatchObject({ enabled: false, status: "pending" });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]).toMatchObject({
      method: "PUT",
      path: "/market/v1/agent-teams/remote-team"
    });
  });

  it("refuses to publish teams without subagents or over the plaza size limit", async () => {
    const empty = await storeWithTeam(shortTeam([]));
    const server = fakeServer();
    await expect(
      new AgentTeamMarketplaceClient(server, empty.store).publish({
        teamId: empty.team.id,
        title: "空团队",
        overview: ""
      })
    ).rejects.toMatchObject({ code: "agent_team_marketplace.empty_team" });

    const longPrompt = "长".repeat(19_000);
    const members = Array.from({ length: 20 }, (_, index) => ({
      ...polisher,
      id: `member-${index}`,
      name: `成员 ${index}`,
      systemPrompt: longPrompt
    }));
    expect(JSON.stringify(members).length * 3).toBeGreaterThan(
      AGENT_TEAM_MARKETPLACE_TEAM_MAX_BYTES
    );
    const large = await storeWithTeam(shortTeam(members));
    await expect(
      new AgentTeamMarketplaceClient(server, large.store).publish({
        teamId: large.team.id,
        title: "大团队",
        overview: ""
      })
    ).rejects.toMatchObject({ code: "agent_team_marketplace.team_too_large" });
    expect(server.requests).toHaveLength(0);
  });

  it("installs a published version once, records its origin and counts the download", async () => {
    const store = await createStore();
    const server = fakeServer(({ path }) =>
      path.endsWith("/download") ? { download_count: 5 } : remoteTeam()
    );
    const client = new AgentTeamMarketplaceClient(
      server,
      store,
      () => new Date("2030-02-01T00:00:00.000Z")
    );

    const result = await client.install({ id: "remote-team" });

    expect(result).toMatchObject({
      teamName: "短篇双人团队",
      downloadCounted: true
    });
    const installed = result.catalog.teams.find(
      (team) => team.id === result.teamId
    )!;
    expect(installed.marketplaceSource).toEqual({
      teamId: "remote-team",
      version: 3,
      installedAt: "2030-02-01T00:00:00.000Z"
    });
    expect(installed.settings.teams[0]!.subagents[0]).toMatchObject({
      modelMode: "inherit",
      draw: { evaluator: { modelMode: "inherit" } }
    });
    expect(
      server.requests.map(({ method, path }) => `${method} ${path}`)
    ).toEqual([
      "GET /market/v1/agent-teams/remote-team",
      "POST /market/v1/agent-teams/remote-team/download"
    ]);

    await expect(client.install({ id: "remote-team" })).rejects.toMatchObject({
      code: "agent_team_marketplace.already_installed"
    });
    const exported = await store.exportProfile({ teamId: result.teamId });
    expect(exported).not.toHaveProperty("marketplaceSource");
  });

  it("keeps the installed team when the download count cannot be recorded", async () => {
    const store = await createStore();
    const server = fakeServer(({ path }) => {
      if (path.endsWith("/download")) {
        throw new MarketplaceClientError(
          "marketplace.network_error",
          "offline"
        );
      }
      return remoteTeam({ version: 4, title: "短篇双人团队 v4" });
    });
    const result = await new AgentTeamMarketplaceClient(server, store).install({
      id: "remote-team"
    });
    expect(result.downloadCounted).toBe(false);
    expect(result.catalog.teams.map((team) => team.name)).toContain(
      "短篇双人团队 v4"
    );
  });

  it("reports teams the installed version cannot read instead of failing schema parsing", async () => {
    const store = await createStore();
    const server = fakeServer(() =>
      remoteTeam({ team: { workspaceType: "short", teams: "future-format" } })
    );
    const client = new AgentTeamMarketplaceClient(server, store);
    await expect(client.detail({ id: "remote-team" })).rejects.toMatchObject({
      code: "agent_team_marketplace.unsupported_team"
    });
    await expect(client.install({ id: "remote-team" })).rejects.toBeInstanceOf(
      MarketplaceClientError
    );
    expect(
      (await store.list()).teams.some((team) => team.marketplaceSource)
    ).toBe(false);
  });

  it("maps list filters and summaries without team definitions", async () => {
    const store = await createStore();
    const { team: _team, ...summary } = remoteTeam({ liked_by_me: true });
    const server = fakeServer(() => ({
      items: [summary],
      page: 2,
      page_size: 24,
      total: 25,
      total_pages: 2
    }));
    const page = await new AgentTeamMarketplaceClient(server, store).list({
      query: "润色",
      workspaceType: "short",
      sort: "likes",
      page: 2,
      pageSize: 24
    });
    expect(server.requests[0]).toMatchObject({
      method: "GET",
      path: "/market/v1/agent-teams?q=%E6%B6%A6%E8%89%B2&workspace_type=short&sort=likes&page=2&page_size=24",
      options: { authenticated: "optional" }
    });
    expect(page.items[0]).toMatchObject({
      id: "remote-team",
      likedByMe: true,
      workspaceType: "short"
    });
    expect(page.items[0]).not.toHaveProperty("team");
  });
});
