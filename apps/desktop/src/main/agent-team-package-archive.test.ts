import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_TEAM_SETTINGS,
  type AgentTeamProfile
} from "@deepwrite/contracts";
import {
  AGENT_TEAM_PACKAGE_MAX_BYTES,
  createAgentTeamPackage,
  readAgentTeamPackage
} from "./agent-team-package-archive";

function team(): AgentTeamProfile {
  const settings = structuredClone(DEFAULT_AGENT_TEAM_SETTINGS);
  settings.teams[0]!.subagents.push({
    id: "reviewer",
    name: "审阅智能体",
    description: "检查成稿",
    systemPrompt: "完整检查成稿。",
    enabled: true,
    agentMode: "standard",
    modelMode: "inherit"
  });
  return {
    id: "team_package_source",
    name: "雨夜审稿团队",
    workspaceType: "short",
    settings
  };
}

describe("agent team package archive", () => {
  it("round-trips the complete versioned team manifest", () => {
    const source = team();
    const archive = createAgentTeamPackage(
      source,
      new Date("2026-08-27T08:00:00.000Z")
    );

    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(readAgentTeamPackage(archive)).toEqual(source);
  });

  it("rejects corrupted and oversized uploads", () => {
    const corrupted = createAgentTeamPackage(team());
    const nameLength = corrupted.readUInt16LE(26);
    const dataOffset = 30 + nameLength;
    corrupted[dataOffset] = (corrupted[dataOffset] ?? 0) ^ 0xff;

    expect(() => readAgentTeamPackage(corrupted)).toThrow();
    expect(() =>
      readAgentTeamPackage(Buffer.alloc(AGENT_TEAM_PACKAGE_MAX_BYTES + 1))
    ).toThrow("5 MB");
  });
});
