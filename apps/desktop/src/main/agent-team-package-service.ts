import { nativeMessages, nativeText } from "./native-i18n";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserWindow, Dialog } from "electron";
import {
  AgentTeamPackageExportResultSchema,
  AgentTeamPackageInstallResultSchema,
  AgentTeamProfileTargetInputSchema,
  type AgentTeamPackageExportResult,
  type AgentTeamPackageInstallResult,
  type AgentTeamProfileTargetInput
} from "@deepwrite/contracts";
import type { AgentTeamConfigStore } from "./agent-team-config-store";
import {
  AGENT_TEAM_PACKAGE_MAX_BYTES,
  createAgentTeamPackage,
  readAgentTeamPackage
} from "./agent-team-package-archive";

type PackageDialog = Pick<Dialog, "showOpenDialog" | "showSaveDialog">;

function safePackageFileName(name: string): string {
  const sanitized = name
    .replaceAll(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replaceAll(/[. ]+$/g, "")
    .trim()
    .slice(0, 80);
  return `${sanitized || "智能体团队"}.deepwrite-team.zip`;
}

export async function downloadAgentTeamPackage(
  window: BrowserWindow,
  dialog: PackageDialog,
  store: AgentTeamConfigStore,
  rawInput: AgentTeamProfileTargetInput,
  defaultDirectory: string
): Promise<AgentTeamPackageExportResult> {
  const input = AgentTeamProfileTargetInputSchema.parse(rawInput);
  const team = await store.exportProfile(input);
  const selection = await dialog.showSaveDialog(window, {
    title: nativeMessages().downloadTeam(team.name),
    buttonLabel: nativeText("downloadTeam"),
    defaultPath: join(defaultDirectory, safePackageFileName(team.name)),
    filters: [{ name: nativeText("agentTeamArchive"), extensions: ["zip"] }]
  });
  if (selection.canceled || !selection.filePath) {
    return AgentTeamPackageExportResultSchema.parse({ status: "canceled" });
  }
  await writeFile(selection.filePath, createAgentTeamPackage(team), {
    flag: "w"
  });
  return AgentTeamPackageExportResultSchema.parse({
    status: "saved",
    filePath: selection.filePath
  });
}

export async function installAgentTeamPackage(
  window: BrowserWindow,
  dialog: PackageDialog,
  store: AgentTeamConfigStore,
  defaultDirectory: string
): Promise<AgentTeamPackageInstallResult> {
  const selection = await dialog.showOpenDialog(window, {
    title: nativeText("installAgentTeam"),
    buttonLabel: nativeText("installTeam"),
    defaultPath: defaultDirectory,
    filters: [{ name: nativeText("agentTeamArchive"), extensions: ["zip"] }],
    properties: ["openFile"]
  });
  const sourcePath = selection.filePaths[0];
  if (selection.canceled || !sourcePath) {
    return AgentTeamPackageInstallResultSchema.parse({ status: "canceled" });
  }
  const metadata = await stat(sourcePath);
  if (!metadata.isFile() || metadata.size > AGENT_TEAM_PACKAGE_MAX_BYTES) {
    throw new Error("智能体团队压缩包无效或超过 5 MB 上限。");
  }
  const installed = await store.installProfile(
    readAgentTeamPackage(await readFile(sourcePath))
  );
  return AgentTeamPackageInstallResultSchema.parse({
    status: "installed",
    teamId: installed.team.id,
    teamName: installed.team.name,
    catalog: installed.catalog
  });
}
