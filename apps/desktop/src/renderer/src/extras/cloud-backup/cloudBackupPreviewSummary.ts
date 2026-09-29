import { createScopedTranslator } from "../../i18n";
import type { CloudBackupChange } from "@deepwrite/contracts";

const t = createScopedTranslator("extras.cloudBackup");

export const CLOUD_BACKUP_CHANGE_ORDER = [
  "add",
  "overwrite",
  "keep",
  "drop"
] as const satisfies readonly CloudBackupChange["change"][];

export const CLOUD_BACKUP_CHANGE_LABELS: Record<
  CloudBackupChange["change"],
  string
> = {
  get add() {
    return t("willAdd");
  },
  get overwrite() {
    return t("willOverwrite");
  },
  get keep() {
    return t("unchanged");
  },
  get drop() {
    return t("willRemoveRemote");
  }
};

export interface CloudBackupPreviewStatusSummary {
  change: CloudBackupChange["change"];
  label: string;
  count: number;
}

export interface CloudBackupPreviewSummary {
  total: number;
  statuses: CloudBackupPreviewStatusSummary[];
}

export function summarizeCloudBackupPreview(
  changes: readonly CloudBackupChange[]
): CloudBackupPreviewSummary {
  const counts: Record<CloudBackupChange["change"], number> = {
    add: 0,
    overwrite: 0,
    keep: 0,
    drop: 0
  };

  for (const item of changes) {
    counts[item.change] += 1;
  }

  return {
    total: changes.length,
    statuses: CLOUD_BACKUP_CHANGE_ORDER.map((change) => ({
      change,
      label: CLOUD_BACKUP_CHANGE_LABELS[change],
      count: counts[change]
    }))
  };
}
