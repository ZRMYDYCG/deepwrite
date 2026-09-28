import { describe, expect, it } from "vitest";
import { expectSourceToContain } from "../../test-utils/sourceText";
import source from "./WorkspaceShell.vue?raw";
import resourceSource from "./composables/useWorkspaceResourceCoordinator.ts?raw";
import layoutSource from "./stores/layoutStore.ts?raw";

describe("App right pane preference integration", () => {
  it("restores a book-specific width and persists explicit resize actions", () => {
    expect(resourceSource).toContain(
      "const activeRightPanePreferenceKey = useBookPanePreferenceKey"
    );
    expect(resourceSource).toContain("longBookId: longNavigation.activeBookId");
    expect(source).toContain(
      "layoutStore.setActiveRightPanePreferenceKey(key)"
    );
    expect(layoutSource).toContain("restoreRightPaneWidthForNavigation(key)");
    expect(layoutSource).toContain(
      "persistActiveRightPaneWidth(rightPaneWidth.value)"
    );
    expect(layoutSource).toContain("rightPaneWidth.value !== currentWidth");
  });

  it("restores navigation widths without animating the whole workspace", () => {
    expect(layoutSource).toContain(
      "const paneTransitionSuppressed = ref(false)"
    );
    expect(layoutSource).toContain(
      '"is-pane-transition-suppressed": paneTransitionSuppressed.value'
    );
    expectSourceToContain(source, '{ flush: "sync", immediate: true }');
    expect(layoutSource).toContain(
      "currentWindow.requestAnimationFrame(() => {"
    );
  });

  it("keys the layout from the selected editor book", () => {
    expect(resourceSource).toContain("document: activeDocument");
    expect(resourceSource).toContain(
      "longWorkspaceActive: longNavigation.workspaceActive"
    );
  });

  it("uses saved widths when reconciling window size without replacing them", () => {
    expect(layoutSource).toContain("restoreRightPaneWidth();");
    expect(layoutSource).toContain(
      "rightPanePreferences.value.widths[key] ?? initialRightPaneWidth"
    );
    expect(layoutSource).toContain(": initialRightPaneWidth;");
    expect(layoutSource).not.toContain(
      "saveRightPanePreferences(window.localStorage, { widths: {} })"
    );
  });
});
