import { t } from "../i18n";
import { computed, provide } from "vue";
import {
  useWorkspaceResourceCoordinator,
  type WorkspaceResourceCoordinatorOptions
} from "./useWorkspaceResourceCoordinator";
import {
  COMPOSER_CONTEXT_NAVIGATION,
  type ComposerContextNavigation
} from "./composerContextNavigationContext";

/** Share existing workspace navigation; build picker choices only on demand. */
export function useWorkspaceResourceNavigation(
  options: WorkspaceResourceCoordinatorOptions
) {
  const resources = useWorkspaceResourceCoordinator(options);
  let navigation: Promise<ComposerContextNavigation | null> | undefined;
  provide(COMPOSER_CONTEXT_NAVIGATION, {
    available: computed(() =>
      options.tree.lookup.value.nodeById.has(
        options.state.selectedResourceId.value
      )
    ),
    load() {
      navigation ??= import("./composerContextNavigation")
        .then(({ createWorkspaceComposerContextNavigation }) =>
          createWorkspaceComposerContextNavigation(options, resources)
        )
        .catch(() => {
          navigation = undefined;
          options.notifications.error(
            t(
              "workspace.workspaceResourceNavigation.couldNotLoadTheSelectionListTryAgain"
            )
          );
          return null;
        });
      return navigation;
    }
  });
  return resources;
}
