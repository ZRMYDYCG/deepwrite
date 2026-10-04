import {
  DEFAULT_AGENT_TEAM_SETTINGS,
  type AgentTeamCatalogSnapshot,
  type DeepWriteApi
} from "@deepwrite/contracts";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../stores/settingsStore";
import { useAgentTeamCatalogCoordinator } from "./useAgentTeamCatalogCoordinator";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function catalog(enabledShort: string | undefined): AgentTeamCatalogSnapshot {
  const team = (id: string) => ({
    id,
    name: id,
    workspaceType: "short" as const,
    settings: DEFAULT_AGENT_TEAM_SETTINGS
  });
  return {
    enabledTeamIds: enabledShort ? { short: enabledShort } : {},
    builtinSubagents: { skill: { enabled: true, description: "" } },
    teams: [team("team_a"), team("team_b")]
  } as unknown as AgentTeamCatalogSnapshot;
}

function harness(initial = catalog("team_a")) {
  setActivePinia(createPinia());
  const settingsStore = useSettingsStore();
  settingsStore.markLoaded("agentTeams", initial);
  const agentTeams = {
    setEnabled: vi.fn(),
    list: vi.fn(async () => initial)
  };
  const notifications = {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  };
  const coordinator = useAgentTeamCatalogCoordinator({
    api: () => ({ agentTeams }) as unknown as DeepWriteApi,
    settingsStore,
    notifications
  });
  return { agentTeams, coordinator, notifications, settingsStore };
}

describe("useAgentTeamCatalogCoordinator.setAgentTeamEnabled", () => {
  it("shows the switch at once and never raises the page-wide saving flag", async () => {
    const { agentTeams, coordinator, settingsStore } = harness();
    const reply = deferred<AgentTeamCatalogSnapshot>();
    agentTeams.setEnabled.mockReturnValue(reply.promise);

    const pending = coordinator.setAgentTeamEnabled({
      teamId: "team_b",
      enabled: true
    });

    expect(settingsStore.agentTeamCatalog?.enabledTeamIds).toEqual({
      short: "team_b"
    });
    expect(settingsStore.agentTeamSaving).toBe(false);

    reply.resolve(catalog("team_b"));
    await pending;
    expect(settingsStore.agentTeamCatalog?.enabledTeamIds).toEqual({
      short: "team_b"
    });
    expect(settingsStore.agentTeamSaving).toBe(false);
  });

  it("restores Main's catalog and reports the error when the change is rejected", async () => {
    const { agentTeams, coordinator, notifications, settingsStore } = harness();
    agentTeams.setEnabled.mockRejectedValue(new Error("disk full"));

    await coordinator.setAgentTeamEnabled({ teamId: "team_b", enabled: true });

    expect(notifications.error).toHaveBeenCalledOnce();
    expect(notifications.success).not.toHaveBeenCalled();
    expect(agentTeams.list).toHaveBeenCalledOnce();
    expect(settingsStore.agentTeamCatalog?.enabledTeamIds).toEqual({
      short: "team_a"
    });
  });

  it("applies only the newest reply when switches overlap", async () => {
    const { agentTeams, coordinator, settingsStore } = harness();
    const first = deferred<AgentTeamCatalogSnapshot>();
    const second = deferred<AgentTeamCatalogSnapshot>();
    agentTeams.setEnabled
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const one = coordinator.setAgentTeamEnabled({
      teamId: "team_b",
      enabled: true
    });
    const two = coordinator.setAgentTeamEnabled({
      teamId: "team_b",
      enabled: false
    });
    // The stale reply (team_b enabled) must not overwrite the newer choice.
    first.resolve(catalog("team_b"));
    await one;
    expect(settingsStore.agentTeamCatalog?.enabledTeamIds).toEqual({});

    second.resolve(catalog(undefined));
    await two;
    expect(settingsStore.agentTeamCatalog?.enabledTeamIds).toEqual({});
  });

  it("ignores a switch while an explicit save is running", async () => {
    const { agentTeams, coordinator, settingsStore } = harness();
    settingsStore.agentTeamSaving = true;

    await coordinator.setAgentTeamEnabled({ teamId: "team_b", enabled: true });

    expect(agentTeams.setEnabled).not.toHaveBeenCalled();
    expect(settingsStore.agentTeamCatalog?.enabledTeamIds).toEqual({
      short: "team_a"
    });
  });
});
