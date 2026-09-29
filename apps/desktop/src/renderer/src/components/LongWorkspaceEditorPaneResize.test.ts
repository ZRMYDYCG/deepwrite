import { describe, expect, it } from "vitest";
import source from "./LongWorkspaceEditor.vue?raw";
import paneResizeSource from "../composables/useLongEditorPaneResize.ts?raw";

describe("LongWorkspaceEditor internal pane resizing", () => {
  it("renders independent accessible separators for both nested lists", () => {
    expect(source).toContain(
      'class="long-editor-internal-resizer long-entry-list-resizer"'
    );
    expect(source).toContain(
      'class="long-editor-internal-resizer long-story-plot-resizer"'
    );
    expect(source).toContain("resizeRightEntryList");
    expect(source).toContain("resizeCurrentPlotPointEventList");
    expect(source.match(/role="separator"/g)).toHaveLength(2);
    expect(source).toContain("handleLongEditorPaneResizeKeydown");
  });

  it("shares the outer resize behavior across every right-list layout", () => {
    expect(source).toContain("const currentUsesAnyRightEntryList = computed");
    expect(source).toContain("currentUsesRightWorldbuildingList.value");
    expect(source).toContain("currentUsesRightCharacterList.value");
    expect(source).toContain("currentUsesRightBookLineList.value");
    expect(source).toContain("currentUsesRightPlotPointList.value");
    expect(source).toContain("currentUsesRightChapterCardList.value");
    expect(source).toContain("currentUsesRightContinuityList.value");
    expect(source).toContain('v-if="currentUsesAnyRightEntryList"');
  });

  it("clamps, persists, reconciles, and cleans up resize state", () => {
    expect(paneResizeSource).toContain("LONG_EDITOR_LIST_MIN_WIDTH");
    expect(paneResizeSource).toContain("LONG_EDITOR_LIST_MAX_WIDTH");
    expect(paneResizeSource).toContain(
      "containerWidth * LONG_EDITOR_DEFAULT_LIST_RATIO"
    );
    expect(paneResizeSource).toContain(
      "saveLongEditorPanePreferences(window.localStorage"
    );
    expect(paneResizeSource).toContain("new ResizeObserver");
    expect(paneResizeSource).toContain(
      'window.addEventListener("resize", reconcileLongEditorPaneWidths)'
    );
    expect(paneResizeSource).toContain(
      'window.removeEventListener("pointermove", handleLongEditorPaneResizeMove)'
    );
    expect(paneResizeSource).toContain("entryListResizeObserver?.disconnect()");
    expect(paneResizeSource).toContain(
      "storyPlotListResizeObserver?.disconnect()"
    );
  });

  it("uses pixel grid variables and hides vertical handles in stacked layouts", () => {
    expect(source).toContain("--long-entry-list-width");
    expect(source).toContain("--long-story-plot-list-width");
    expect(source).toContain("@container (max-width: 31rem)");
    expect(source).toMatch(/\.long-story-plot-resizer\s*\{\s*display:\s*none;/);
    expect(source).toMatch(/\.long-entry-list-resizer\s*\{\s*display:\s*none;/);
  });
});
