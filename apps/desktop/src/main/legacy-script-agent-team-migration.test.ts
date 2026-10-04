import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_TEAM_SETTINGS,
  DEFAULT_LONG_AGENT_TEAM_SETTINGS,
  type ScriptAgentSubagentDefinition
} from "@deepwrite/contracts";
import { tryMigrateCombinedCatalog } from "./agent-team-config-migration";
import { migrateLegacyScriptAgentTeamSettings } from "./legacy-script-agent-team-migration";

function definition(
  index: number,
  parent: "character" | "plot" | "outline" | "draft" | "writer"
): ScriptAgentSubagentDefinition {
  return {
    id: `helper_${index}`,
    name: `助手 ${index}`,
    description: `${parent} 阶段助手`,
    systemPrompt: `处理 ${parent} 阶段任务。`,
    enabled: index % 2 === 0,
    agentMode: "standard",
    modelMode: "custom",
    modelId: `model-${parent}`,
    thinkingLevel: index === 1 ? "off" : "high",
    ...(index === 1 ? { temperature: 0.7 } : {})
  };
}

function legacySettings(count = 20) {
  return {
    workspaceType: "script",
    teams: [
      {
        parentAgentId: "character_design",
        subagents: Array.from({ length: count }, (_, index) =>
          definition(index + 1, "character")
        )
      },
      {
        parentAgentId: "plot_design",
        subagents: Array.from({ length: count }, (_, index) =>
          definition(index + 1, "plot")
        )
      },
      {
        parentAgentId: "expert_draft_coordinator",
        subagents: Array.from({ length: count }, (_, index) =>
          definition(index + 1, "draft")
        )
      }
    ]
  };
}

function earliestLegacySettings(count = 20) {
  const parents = [
    ["character_design", "character"],
    ["plot_design", "plot"],
    ["outline", "outline"],
    ["expert_draft_coordinator", "draft"],
    ["expert_section_writer", "writer"]
  ] as const;
  return {
    workspaceType: "script",
    teams: parents.map(([parentAgentId, parent]) => ({
      parentAgentId,
      subagents: Array.from({ length: count }, (_, index) =>
        definition(index + 1, parent)
      )
    }))
  };
}

describe("legacy script agent team migration", () => {
  it("merges three full teams in stage order without losing runtime fields", () => {
    const migrated = migrateLegacyScriptAgentTeamSettings(legacySettings());
    expect(migrated).toHaveLength(1);
    const definitions = migrated?.[0]?.teams[0]?.subagents ?? [];
    expect(definitions).toHaveLength(60);
    expect(
      new Set(definitions.map(({ id }) => id.toLocaleLowerCase())).size
    ).toBe(60);
    expect(
      new Set(definitions.map(({ name }) => name.toLocaleLowerCase())).size
    ).toBe(60);
    expect(definitions[0]).toMatchObject({
      id: "helper_1",
      modelId: "model-character",
      thinkingLevel: "off",
      temperature: 0.7,
      enabled: false
    });
    expect(definitions[20]).toMatchObject({
      id: "helper_1_plot_design",
      name: "助手 1（剧情）",
      modelId: "model-plot"
    });
    expect(definitions[40]).toMatchObject({
      id: "helper_1_expert_draft_coordinator",
      name: "助手 1（正文）",
      modelId: "model-draft"
    });
  });

  it("rejects malformed or oversized legacy teams", () => {
    expect(
      migrateLegacyScriptAgentTeamSettings({
        workspaceType: "script",
        teams: []
      })
    ).toBeUndefined();
    expect(
      migrateLegacyScriptAgentTeamSettings(legacySettings(21))
    ).toBeUndefined();
  });

  it("migrates the earliest five-parent format and splits overflow without data loss", () => {
    const migrated = migrateLegacyScriptAgentTeamSettings(
      earliestLegacySettings()
    );
    expect(migrated?.map(({ teams }) => teams[0]!.subagents.length)).toEqual([
      60, 40
    ]);
    const definitions =
      migrated?.flatMap(({ teams }) => teams[0]!.subagents) ?? [];
    expect(definitions).toHaveLength(100);
    expect(new Set(definitions.map(({ id }) => id)).size).toBe(100);
    expect(
      definitions.some(({ id }) => id.endsWith("_expert_section_writer"))
    ).toBe(true);
  });

  it("accepts the intermediate four-parent format", () => {
    const raw = earliestLegacySettings(1);
    raw.teams = raw.teams.filter(
      ({ parentAgentId }) => parentAgentId !== "outline"
    );
    expect(
      migrateLegacyScriptAgentTeamSettings(raw)?.[0]?.teams[0]?.subagents
    ).toHaveLength(4);
  });

  it("increments suffixes after case-insensitive id and name collisions", () => {
    const raw = legacySettings(0);
    raw.teams[0]!.subagents = [
      { ...definition(1, "character"), id: "helper", name: "助手" },
      {
        ...definition(2, "character"),
        id: "helper_expert_draft_coordinator",
        name: "助手（正文）"
      }
    ];
    raw.teams[2]!.subagents = [
      { ...definition(1, "draft"), id: "HELPER", name: "助手" }
    ];
    const migrated = migrateLegacyScriptAgentTeamSettings(raw);
    expect(migrated).toHaveLength(1);
    const definitions = migrated?.[0]?.teams[0]?.subagents ?? [];
    expect(definitions[2]).toMatchObject({
      id: "HELPER_expert_draft_coordinator_2",
      name: "助手（正文）_2"
    });
  });

  it("preserves profile identity, name and enabled script profile id", () => {
    const migrated = tryMigrateCombinedCatalog({
      enabledTeamIds: { script: "profile_script" },
      teams: [
        {
          id: "profile_short",
          name: "我的短篇团队",
          workspaceType: "short",
          settings: DEFAULT_AGENT_TEAM_SETTINGS
        },
        {
          id: "profile_script",
          name: "我的剧本团队",
          workspaceType: "script",
          settings: legacySettings(1)
        },
        {
          id: "profile_long",
          name: "我的长篇团队",
          workspaceType: "long",
          settings: DEFAULT_LONG_AGENT_TEAM_SETTINGS
        }
      ]
    });
    const script = migrated?.teams.find(
      (team) => team.workspaceType === "script"
    );
    expect(script).toMatchObject({
      id: "profile_script",
      name: "我的剧本团队",
      settings: { teams: [{ parentAgentId: "script" }] }
    });
    expect(migrated?.enabledTeamIds.script).toBe("profile_script");
  });
});
