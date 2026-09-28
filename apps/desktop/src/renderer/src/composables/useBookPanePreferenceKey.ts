import { computed, type Ref } from "vue";
import {
  rightPanePreferenceKey,
  type RightPaneBookDocument
} from "../utils/rightPanePreferences";

export function useBookPanePreferenceKey(options: {
  document: Readonly<Ref<RightPaneBookDocument>>;
  longWorkspaceActive: Readonly<Ref<boolean>>;
  longBookId: Readonly<Ref<string | null>>;
}) {
  return computed(() => {
    if (options.longWorkspaceActive.value) {
      return rightPanePreferenceKey({
        domain: "creation",
        workspaceType: "long",
        workspaceId: options.longBookId.value ?? ""
      });
    }
    return rightPanePreferenceKey(options.document.value);
  });
}
