import {
  DEFAULT_AGENT_TEAM_SETTINGS,
  type AgentTeamCatalogSnapshot,
  type AgentTeamMarketplaceSummary,
  type MarketplaceSession
} from "@deepwrite/contracts";
import { describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import { useTeamPlaza, type TeamPlazaApi } from "./useTeamPlaza";
import { useTeamPlazaPublish } from "./useTeamPlazaPublish";
import { uiMessage } from "../../ui-feedback";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const session: MarketplaceSession = {
  authenticated: true,
  user: {
    id: "user",
    username: "writer",
    displayName: "作者",
    avatarUrl: "",
    bio: "",
    createdAt: "2030-01-01T00:00:00Z"
  },
  expiresAt: "2030-02-01T00:00:00Z",
  persistent: true,
  insecureTransport: false
};

function summary(
  overrides: Partial<AgentTeamMarketplaceSummary> = {}
): AgentTeamMarketplaceSummary {
  return {
    id: "remote-team",
    title: "双人团队",
    overview: "",
    workspaceType: "short",
    memberCount: 2,
    version: 2,
    visibility: "public",
    status: "published",
    enabled: true,
    downloadCount: 0,
    likeCount: 1,
    likedByMe: false,
    ownerUsername: "writer",
    ownerName: "作者",
    createdAt: "2030-01-01T00:00:00Z",
    updatedAt: "2030-01-01T00:00:00Z",
    ...overrides
  };
}

function catalog(
  teams: AgentTeamCatalogSnapshot["teams"]
): AgentTeamCatalogSnapshot {
  return {
    enabledTeamIds: {},
    builtinSubagents: { skill: { enabled: true, description: "" } },
    teams
  } as unknown as AgentTeamCatalogSnapshot;
}

function harness(initialCatalog = catalog([])) {
  const currentCatalog = shallowRef(initialCatalog);
  const agentTeamMarketplace = {
    list: vi.fn(),
    listMine: vi.fn(async () => ({
      items: [summary()],
      page: 1,
      total: 1,
      totalPages: 1
    })),
    detail: vi.fn(),
    myDetail: vi.fn(),
    publish: vi.fn(async () => ({
      ...summary({ status: "pending" }),
      team: DEFAULT_AGENT_TEAM_SETTINGS
    })),
    update: vi.fn(async () => undefined),
    setEnabled: vi.fn(),
    delete: vi.fn(),
    like: vi.fn(),
    install: vi.fn()
  };
  const marketplace = { session: vi.fn(async () => session), logout: vi.fn() };
  const api = () =>
    ({ agentTeamMarketplace, marketplace }) as unknown as TeamPlazaApi;
  const onCatalogChange = vi.fn((next: AgentTeamCatalogSnapshot) => {
    currentCatalog.value = next;
  });
  const plaza = useTeamPlaza({
    api,
    catalog: () => currentCatalog.value,
    initialSession: session,
    onSessionChange: vi.fn(),
    onCatalogChange
  });
  return { plaza, api, agentTeamMarketplace, onCatalogChange };
}

describe("agent team plaza", () => {
  it("switches visibility optimistically and lets the newest request decide", async () => {
    const { plaza, agentTeamMarketplace } = harness();
    await plaza.loadMine(1);
    const item = plaza.mine.items[0]!;
    const first = deferred<AgentTeamMarketplaceSummary>();
    const second = deferred<AgentTeamMarketplaceSummary>();
    agentTeamMarketplace.setEnabled
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const disabling = plaza.setEnabled(item, false);
    expect(item.enabled).toBe(false);
    const enabling = plaza.setEnabled(item, true);
    expect(item.enabled).toBe(true);
    second.resolve(summary({ enabled: true }));
    await enabling;
    first.resolve(summary({ enabled: false }));
    await disabling;
    expect(item.enabled).toBe(true);

    agentTeamMarketplace.setEnabled.mockRejectedValueOnce(new Error("offline"));
    await plaza.setEnabled(item, false);
    expect(item.enabled).toBe(true);
  });

  it("restores the like state when the request fails", async () => {
    const { plaza, agentTeamMarketplace } = harness();
    await plaza.loadMine(1);
    const item = plaza.mine.items[0]!;
    agentTeamMarketplace.like.mockRejectedValueOnce(new Error("offline"));
    await plaza.toggleLike(item);
    expect(item).toMatchObject({ likedByMe: false, likeCount: 1 });
    agentTeamMarketplace.like.mockResolvedValueOnce({
      liked: true,
      likeCount: 7
    });
    await plaza.toggleLike(item);
    expect(item).toMatchObject({ likedByMe: true, likeCount: 7 });
  });

  it("offers install, update and installed states from local plaza origins", async () => {
    const installedTeam = {
      id: "team_local",
      name: "双人团队",
      workspaceType: "short",
      settings: DEFAULT_AGENT_TEAM_SETTINGS,
      marketplaceSource: {
        teamId: "remote-team",
        version: 2,
        installedAt: "2030-01-01T00:00:00Z"
      }
    } as AgentTeamCatalogSnapshot["teams"][number];
    const { plaza, agentTeamMarketplace, onCatalogChange } = harness(
      catalog([installedTeam])
    );

    expect(plaza.installAction(summary())).toMatchObject({ disabled: true });
    expect(plaza.installAction(summary({ id: "other" })).disabled).toBe(false);
    expect(plaza.installAction(summary({ enabled: false })).disabled).toBe(
      true
    );
    const update = summary({ version: 3 });
    expect(plaza.installAction(update).disabled).toBe(false);

    const result = deferred<unknown>();
    agentTeamMarketplace.install.mockReturnValueOnce(result.promise);
    const installing = plaza.install(update);
    expect(plaza.installAction(update).disabled).toBe(true);
    const next = catalog([
      installedTeam,
      {
        ...installedTeam,
        id: "team_v3",
        marketplaceSource: { ...installedTeam.marketplaceSource!, version: 3 }
      }
    ]);
    result.resolve({
      teamId: "team_v3",
      teamName: "双人团队 (2)",
      catalog: next,
      downloadCounted: true
    });
    await installing;
    expect(onCatalogChange).toHaveBeenCalledWith(next);
    expect(plaza.installAction(update).disabled).toBe(true);
  });
});

describe("agent team plaza publish form", () => {
  it("sends only the chosen local team and counts model bindings that will be reset", async () => {
    const local = {
      id: "team_local",
      name: "我的团队",
      workspaceType: "short",
      settings: {
        ...DEFAULT_AGENT_TEAM_SETTINGS,
        teams: [
          {
            parentAgentId: "short",
            subagents: [
              {
                id: "plotter",
                name: "构思",
                description: "构思",
                systemPrompt: "构思",
                enabled: true,
                agentMode: "standard",
                modelMode: "custom",
                modelId: "local-model",
                thinkingLevel: "high"
              }
            ]
          }
        ]
      }
    } as AgentTeamCatalogSnapshot["teams"][number];
    const { api, agentTeamMarketplace } = harness();
    const onSubmitted = vi.fn(async () => undefined);
    const form = useTeamPlazaPublish({
      api,
      catalog: () => catalog([local]),
      onSubmitted
    });

    await form.submit();
    expect(agentTeamMarketplace.publish).not.toHaveBeenCalled();

    form.selectTeam("team_local");
    expect(form.title.value).toBe("我的团队");
    expect(form.members.value).toHaveLength(1);
    expect(form.customModelCount.value).toBe(1);
    form.overview.value = "  适合短篇  ";
    await form.submit();

    expect(agentTeamMarketplace.publish).toHaveBeenCalledWith({
      teamId: "team_local",
      title: "我的团队",
      overview: "适合短篇"
    });
    expect(onSubmitted).toHaveBeenCalledOnce();
    expect(form.teamId.value).toBe("");

    const warning = vi.spyOn(uiMessage, "warning");
    agentTeamMarketplace.publish.mockResolvedValueOnce({
      ...summary({ enabled: false, status: "pending" }),
      team: DEFAULT_AGENT_TEAM_SETTINGS
    });
    form.selectTeam("team_local");
    await form.submit();
    expect(warning).toHaveBeenCalledWith(
      "团队已上传，但自动开启广场展示失败。请在“我的发布”中开启，无需重复上传。"
    );
    expect(form.teamId.value).toBe("");
    expect(onSubmitted).toHaveBeenCalledTimes(2);
    await form.submit();
    expect(agentTeamMarketplace.publish).toHaveBeenCalledTimes(2);
    warning.mockRestore();

    form.startEdit(summary({ id: "remote-1", title: "我的团队" }));
    expect(form.teamId.value).toBe("team_local");
    await form.submit();
    expect(agentTeamMarketplace.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "remote-1", teamId: "team_local" })
    );
  });
});
