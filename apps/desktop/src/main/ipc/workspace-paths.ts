import { nativeText } from "../native-i18n";
import { join } from "node:path";
import { WorkspaceDirectorySettingsSchema } from "@deepwrite/contracts";
import type { WorkspaceDirectoryStore } from "../workspace-directory-store";

export function workspaceResourceParent(
  workspaceDirectory: string,
  domain: "book" | "material" | "skill"
): string {
  return join(
    workspaceDirectory,
    domain === "book" ? "books" : domain === "material" ? "materials" : "skills"
  );
}

export function workspaceGroupParent(
  workspaceDirectory: string,
  domain: "material" | "skill"
): string {
  return join(
    workspaceDirectory,
    domain === "material" ? "material-groups" : "skill-groups"
  );
}

export async function chooseWorkspaceDirectory(options: {
  requireWorkspaceDirectoryStore: () => WorkspaceDirectoryStore;
  getDocumentsPath: () => string;
  dialog: Pick<Electron.Dialog, "showOpenDialog">;
}): Promise<ReturnType<typeof WorkspaceDirectorySettingsSchema.parse> | null> {
  const current = await options.requireWorkspaceDirectoryStore().list();
  const selection = await options.dialog.showOpenDialog({
    title: nativeText("chooseWorkspace"),
    defaultPath: current.path ?? options.getDocumentsPath(),
    properties: ["openDirectory", "createDirectory"]
  });
  const selectedDirectory = selection.filePaths[0];
  if (selection.canceled || !selectedDirectory) {
    return null;
  }
  return WorkspaceDirectorySettingsSchema.parse(
    await options.requireWorkspaceDirectoryStore().save(selectedDirectory)
  );
}

export async function requireSelectedWorkspaceDirectory(options: {
  requireWorkspaceDirectoryStore: () => WorkspaceDirectoryStore;
  chooseWorkspaceDirectory: () => Promise<ReturnType<
    typeof WorkspaceDirectorySettingsSchema.parse
  > | null>;
}): Promise<string | null> {
  const current = await options.requireWorkspaceDirectoryStore().list();
  if (current.path) {
    return current.path;
  }
  return (await options.chooseWorkspaceDirectory())?.path ?? null;
}
