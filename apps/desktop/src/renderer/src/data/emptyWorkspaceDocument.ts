import { createScopedTranslator } from "../i18n";
import type { WorkspaceDocument } from "../types/workspace";

const t = createScopedTranslator("workspace");

export const EMPTY_WORKSPACE_DOCUMENT: WorkspaceDocument = {
  id: "deepwrite-empty-workspace",
  domain: "creation",
  get title() {
    return t("emptyWorkspaceDocument.noBookOpen");
  },
  get eyebrow() {
    return t("emptyWorkspaceDocument.workspace");
  },
  get path() {
    return [t("emptyWorkspaceDocument.noBookOpen")];
  },
  get content() {
    return t("builtins.emptyWorkspace");
  },
  readOnly: true,
  format: "设定"
};
