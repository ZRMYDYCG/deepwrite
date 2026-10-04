import { describe, expect, it } from "vitest";
import pageSource from "./LongBookDecompositionPage.vue?raw";
import setupSource from "./DecompositionSetup.vue?raw";
import rangeSource from "./DecompositionRangeCard.vue?raw";
import progressSource from "./DecompositionProgress.vue?raw";
import profileSource from "./DecompositionProfileManager.vue?raw";
import taskBarSource from "./DecompositionTaskBar.vue?raw";
import recordDialogSource from "./DecompositionRecordDialog.vue?raw";

describe("long-book decomposition page layout", () => {
  it("shares the long-analysis page scope for source, field and run-bar styles", () => {
    expect(pageSource).toContain(
      'class="long-book-analysis-page long-book-decomposition-page"'
    );
    expect(pageSource).toContain(
      'import "../long-book-analysis/long-book-analysis.css"'
    );
    expect(pageSource).toContain("<AnalysisSourceControls");
    expect(pageSource).toContain("<LongAnalysisSourceSummary");
    expect(pageSource).toContain(":manage-label=");
    expect(setupSource).toContain('class="setup-grid"');
    expect(setupSource).toContain('class="analysis-run-bar"');
    expect(rangeSource).toContain('class="chapter-range-inputs"');
  });

  it("explains blocked creation with a stable hint instead of a toast", () => {
    expect(setupSource).toContain("const blocker = computed");
    expect(setupSource).toContain('t("sourceRequired")');
    expect(setupSource).toContain(':disabled="disabled || !!blocker"');
    expect(setupSource).toContain("field");
  });

  it("keeps task controls out of table cells and confirms through one dialog", () => {
    expect(progressSource).not.toMatch(/<td[^>]*decomposition-actions/);
    expect(progressSource).toContain("<DecompositionDialog");
    expect(pageSource).toContain("<DecompositionDialog");
    expect(taskBarSource).toContain("decompositionJobOption");
  });

  it("edits profiles in the shared preset modal, not inline", () => {
    expect(profileSource).toContain("<PresetManagerShell");
    expect(pageSource).toContain("<DecompositionProfileManager");
    expect(pageSource).not.toContain('v-if="profilesOpen"');
  });

  it("opens unit records in a dialog instead of jumping to the workspace", () => {
    expect(progressSource).toContain("emit(\n                      'view',");
    expect(progressSource).not.toContain("outputRefs[0]");
    expect(pageSource).toContain("<DecompositionRecordDialog");
    expect(recordDialogSource).toContain('<Teleport to="body">');
    expect(recordDialogSource).toContain("controller.readUnit(");
    expect(recordDialogSource).toContain('t("viewTarget")');
  });
});
