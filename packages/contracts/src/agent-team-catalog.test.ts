import { describe, expect, it } from "vitest";
import {
  AgentTeamCatalogSnapshotSchema,
  AgentTeamPackageExportResultSchema,
  AgentTeamPackageInstallResultSchema,
  AgentTeamPackageManifestSchema,
  CommandEnvelopeSchema,
  DEFAULT_AGENT_TEAM_SETTINGS,
  DEFAULT_LONG_AGENT_TEAM_SETTINGS,
  createEnvelope,
  withAgentTeamEnabled
} from "./index";

function shortProfile(id = "team_short", name = "短篇团队") {
  return {
    id,
    name,
    workspaceType: "short" as const,
    settings: DEFAULT_AGENT_TEAM_SETTINGS
  };
}

describe("agent team catalog contracts", () => {
  it("allows all types to be disabled and validates enabled type references", () => {
    expect(
      AgentTeamCatalogSnapshotSchema.parse({
        enabledTeamIds: {},
        teams: [shortProfile()]
      }).enabledTeamIds
    ).toEqual({});
    expect(() =>
      AgentTeamCatalogSnapshotSchema.parse({
        enabledTeamIds: { long: "team_short" },
        teams: [shortProfile()]
      })
    ).toThrow();
  });

  it("requires unique ids and case-insensitively unique names", () => {
    expect(() =>
      AgentTeamCatalogSnapshotSchema.parse({
        enabledTeamIds: {},
        teams: [shortProfile(), shortProfile("team_second", "短篇团队")]
      })
    ).toThrow();
    expect(() =>
      AgentTeamCatalogSnapshotSchema.parse({
        enabledTeamIds: {},
        teams: [
          shortProfile("team_same"),
          shortProfile("team_same", "另一团队")
        ]
      })
    ).toThrow();
  });

  it("registers all catalog lifecycle commands", () => {
    const commands = [
      createEnvelope("agentTeams.list", {}, { id: "list" }),
      createEnvelope(
        "agentTeams.create",
        { name: "审稿团队", workspaceType: "short" },
        { id: "create" }
      ),
      createEnvelope(
        "agentTeams.rename",
        { teamId: "team_short", name: "主团队" },
        { id: "rename" }
      ),
      createEnvelope(
        "agentTeams.setEnabled",
        { teamId: "team_short", enabled: true },
        { id: "enable" }
      ),
      createEnvelope(
        "agentTeams.delete",
        { teamId: "team_second" },
        { id: "delete" }
      ),
      createEnvelope(
        "agentTeams.save",
        { teamId: "team_long", settings: DEFAULT_LONG_AGENT_TEAM_SETTINGS },
        { id: "save" }
      ),
      createEnvelope(
        "agentTeams.exportPackage",
        { teamId: "team_short" },
        { id: "export" }
      ),
      createEnvelope("agentTeams.installPackage", {}, { id: "install" })
    ];
    expect(
      commands.every(
        (command) => CommandEnvelopeSchema.safeParse(command).success
      )
    ).toBe(true);
  });

  it("validates versioned package manifests and file operation results", () => {
    expect(
      AgentTeamPackageManifestSchema.parse({
        format: "deepwrite-agent-team",
        version: 1,
        exportedAt: "2026-08-27T08:00:00.000Z",
        team: shortProfile()
      }).team.name
    ).toBe("短篇团队");
    expect(
      AgentTeamPackageExportResultSchema.parse({
        status: "saved",
        filePath: "/tmp/team.zip"
      }).status
    ).toBe("saved");
    expect(
      AgentTeamPackageInstallResultSchema.parse({
        status: "installed",
        teamId: "team_installed",
        teamName: "已安装团队",
        catalog: {
          enabledTeamIds: {},
          teams: [shortProfile("team_installed", "已安装团队")]
        }
      }).status
    ).toBe("installed");
  });

  it("enables at most one team per writing type without mutating its input", () => {
    const enabled = { short: "team_a", script: "team_s" };
    const switched = withAgentTeamEnabled(
      enabled,
      { id: "team_b", workspaceType: "short" },
      true
    );
    expect(switched).toEqual({ short: "team_b", script: "team_s" });
    expect(enabled).toEqual({ short: "team_a", script: "team_s" });
  });

  it("only disables a team that is the enabled one for its type", () => {
    const enabled = { short: "team_a" };
    expect(
      withAgentTeamEnabled(
        enabled,
        { id: "team_a", workspaceType: "short" },
        false
      )
    ).toEqual({});
    expect(
      withAgentTeamEnabled(
        enabled,
        { id: "team_b", workspaceType: "short" },
        false
      )
    ).toEqual({ short: "team_a" });
  });
});
