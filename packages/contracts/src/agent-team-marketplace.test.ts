import { describe, expect, it } from "vitest";
import { DEFAULT_LONG_AGENT_TEAM_SETTINGS } from "./long-agent-team";
import {
  AgentTeamMarketplaceDetailSchema,
  AgentTeamMarketplacePublishInputSchema,
  agentTeamCustomModelCount,
  agentTeamMemberCount,
  withInheritedSubagentModels
} from "./agent-team-marketplace";
import type { LongAgentTeamSettings } from "./long-agent-team";

const longTeam: LongAgentTeamSettings = {
  ...DEFAULT_LONG_AGENT_TEAM_SETTINGS,
  teams: DEFAULT_LONG_AGENT_TEAM_SETTINGS.teams.map((team, index) => ({
    ...team,
    subagents:
      index === 0
        ? [
            {
              id: "researcher",
              name: "资料员",
              description: "查资料",
              systemPrompt: "你负责查资料。",
              enabled: true,
              agentMode: "pure-read",
              modelMode: "custom",
              modelId: "local-model",
              thinkingLevel: "off",
              temperature: 0.2,
              draw: {
                enabled: true,
                count: 2,
                selection: "auto",
                evaluator: {
                  modelMode: "custom",
                  modelId: "judge",
                  thinkingLevel: "low"
                }
              }
            }
          ]
        : []
  }))
};

describe("agent team marketplace contracts", () => {
  it("resets local model bindings for sharing without touching the source", () => {
    expect(agentTeamMemberCount(longTeam)).toBe(1);
    expect(agentTeamCustomModelCount(longTeam)).toBe(2);

    const shared = withInheritedSubagentModels(longTeam);

    expect(agentTeamCustomModelCount(shared)).toBe(0);
    expect(shared.teams[0]!.subagents[0]).toEqual({
      ...longTeam.teams[0]!.subagents[0],
      modelMode: "inherit",
      modelId: undefined,
      thinkingLevel: undefined,
      temperature: undefined,
      draw: {
        enabled: true,
        count: 2,
        selection: "auto",
        evaluator: { modelMode: "inherit" }
      }
    });
    expect(longTeam.teams[0]!.subagents[0]!.modelId).toBe("local-model");
  });

  it("requires the detail team to match the listed writing type", () => {
    const base = {
      id: "remote",
      title: "长篇团队",
      overview: "",
      memberCount: 1,
      version: 1,
      visibility: "public",
      status: "published",
      enabled: true,
      downloadCount: 0,
      likeCount: 0,
      likedByMe: false,
      ownerUsername: "writer",
      ownerName: "作者",
      createdAt: "2030-01-01T00:00:00Z",
      updatedAt: "2030-01-01T00:00:00Z",
      team: longTeam
    };
    expect(
      AgentTeamMarketplaceDetailSchema.safeParse({
        ...base,
        workspaceType: "long"
      }).success
    ).toBe(true);
    expect(
      AgentTeamMarketplaceDetailSchema.safeParse({
        ...base,
        workspaceType: "short"
      }).success
    ).toBe(false);
  });

  it("publishes a local team by id only", () => {
    expect(
      AgentTeamMarketplacePublishInputSchema.safeParse({
        teamId: "team_local",
        title: "团队",
        overview: "",
        team: longTeam
      }).success
    ).toBe(false);
  });
});
