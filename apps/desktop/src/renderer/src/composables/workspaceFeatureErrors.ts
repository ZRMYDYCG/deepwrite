import { watch } from "vue";
import type { WorkspaceFeatureHostCoordinatorOptions } from "./workspaceFeatureHostTypes";
export function watchFeatureErrors(
  options: WorkspaceFeatureHostCoordinatorOptions,
  active: () => boolean
) {
  const features = [
    options.features.subagentAuthoring,
    options.features.shortBookAnalysis,
    options.features.longBookAnalysis,
    options.features.revisionAnalysis
  ];
  const stops = features.map((feature) =>
    watch(
      () => feature?.controller.value?.error.value,
      (message) => {
        if (active() && message) options.notifications.error(message);
      }
    )
  );
  return () => stops.forEach((stop) => stop());
}
