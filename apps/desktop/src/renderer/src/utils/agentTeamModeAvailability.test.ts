import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_TEAM_SETTINGS,
  DEFAULT_LONG_AGENT_TEAM_SETTINGS,
  DEFAULT_SCRIPT_AGENT_TEAM_SETTINGS,
  AgentTeamCatalogSnapshotSchema,
  type AgentTeamWorkspaceType,
  type AgentTeamCatalogSnapshot
} from "@deepwrite/contracts";
import { resolveAgentTeamModeAvailability } from "./agentTeamModeAvailability";

const member = {
  id: "researcher",
  name: "资料员",
  description: "查找资料",
  systemPrompt: "只整理与任务有关的资料。",
  enabled: true,
  agentMode: "standard" as const,
  modelMode: "inherit" as const
};

function catalogWithMember(
  workspaceType: AgentTeamWorkspaceType
): AgentTeamCatalogSnapshot {
  if (workspaceType === "short") {
    const settings = structuredClone(DEFAULT_AGENT_TEAM_SETTINGS);
    settings.teams[0]!.subagents = [member];
    return AgentTeamCatalogSnapshotSchema.parse({
      enabledTeamIds: { short: "team-short" },
      teams: [
        {
          id: "team-short",
          name: "短篇团队",
          workspaceType,
          settings
        }
      ]
    });
  }
  if (workspaceType === "script") {
    const settings = structuredClone(DEFAULT_SCRIPT_AGENT_TEAM_SETTINGS);
    settings.teams[0]!.subagents = [member];
    return AgentTeamCatalogSnapshotSchema.parse({
      enabledTeamIds: { script: "team-script" },
      teams: [
        {
          id: "team-script",
          name: "剧本团队",
          workspaceType,
          settings
        }
      ]
    });
  }
  const settings = structuredClone(DEFAULT_LONG_AGENT_TEAM_SETTINGS);
  settings.teams[0]!.subagents = [member];
  return AgentTeamCatalogSnapshotSchema.parse({
    enabledTeamIds: { long: "team-long" },
    teams: [
      {
        id: "team-long",
        name: "长篇团队",
        workspaceType,
        settings
      }
    ]
  });
}

describe("agent team mode availability", () => {
  it("enables team mode only for the current parent agent with an enabled member", () => {
    for (const [workspaceType, parentAgentId] of [
      ["short", "short"],
      ["script", "script"],
      ["long", "long"]
    ] as const) {
      expect(
        resolveAgentTeamModeAvailability({
          catalog: catalogWithMember(workspaceType),
          workspaceType,
          parentAgentId,
          loaded: true,
          loading: false,
          loadError: null
        }).available
      ).toBe(true);
    }
    expect(
      resolveAgentTeamModeAvailability({
        catalog: catalogWithMember("short"),
        workspaceType: "short",
        parentAgentId: "character",
        loaded: true,
        loading: false,
        loadError: null
      })
    ).toMatchObject({ available: false });
  });

  it("disables team mode while loading or after a load failure", () => {
    expect(
      resolveAgentTeamModeAvailability({
        catalog: null,
        workspaceType: "long",
        parentAgentId: "long",
        loaded: false,
        loading: true,
        loadError: null
      }).description
    ).toContain("正在加载");
    expect(
      resolveAgentTeamModeAvailability({
        catalog: null,
        workspaceType: "script",
        parentAgentId: "script",
        loaded: false,
        loading: false,
        loadError: "读取失败"
      }).description
    ).toContain("加载失败");
  });
});
