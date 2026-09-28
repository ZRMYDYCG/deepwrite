export type AppView = "workspace" | "settings";

export type WorkspaceMainView =
  | "conversation"
  | "directory"
  | "long-book-analysis"
  | "revision-analysis"
  | "short-book-analysis"
  | "style-comparison"
  | "agent-team"
  | "marketplace"
  | "cloud-backup"
  | "device-sync"
  | "zhuque-detection";

export type PrimaryFeature =
  | "directory"
  | "long-book-analysis"
  | "revision-analysis"
  | "short-book-analysis"
  | "style-comparison"
  | "chat-assistant"
  | "agent-teams"
  | "skill-marketplace"
  | "cloud-backup"
  | "device-sync"
  | "zhuque-detection";

export function primaryFeatureForView(
  view: WorkspaceMainView
): PrimaryFeature | undefined {
  switch (view) {
    case "agent-team":
      return "agent-teams";
    case "marketplace":
      return "skill-marketplace";
    case "device-sync":
    case "cloud-backup":
    case "zhuque-detection":
    case "directory":
    case "long-book-analysis":
    case "revision-analysis":
    case "short-book-analysis":
    case "style-comparison":
      return view;
    default:
      return undefined;
  }
}
