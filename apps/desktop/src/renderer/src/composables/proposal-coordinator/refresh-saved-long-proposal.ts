import { t } from "../../i18n";
export async function refreshSavedLongProposal(options: {
  refresh(): Promise<boolean>;
  warn(message: string): void;
}): Promise<void> {
  try {
    // False also means a newer refresh or another book superseded this one.
    // Active refresh failures already report through the workspace coordinator.
    await options.refresh();
  } catch {
    // The write already succeeded. Never relabel or replay it because a read failed.
    options.warn(
      t(
        "workspace.refreshSavedLongProposal.theWorldbuildingFileWasSavedButTheInterfaceCould"
      )
    );
  }
}
