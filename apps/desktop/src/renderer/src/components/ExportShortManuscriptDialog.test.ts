import { describe, expect, it } from "vitest";
import { expectSourceToContain } from "../../../test-utils/sourceText";
import source from "./ExportShortManuscriptDialog.vue?raw";

describe("ExportShortManuscriptDialog", () => {
  it("shows type-specific export-scope reminders above the format choices", () => {
    const reminder = source.indexOf("exportScope");
    const choices = source.indexOf("selectExportFormat");
    expect(reminder).toBeGreaterThan(-1);
    expect(choices).toBeGreaterThan(reminder);
    expect(source).toContain(
      "exportsTheIntroductionAndAllManuscriptSectionsOnlyExcluding"
    );
    expect(source).toContain(
      "exportsAllEpisodeManuscriptsOnlyExcludingCharacterStatePlot"
    );
    expect(source).toContain("workspaceType === 'script'");
    expect(source).toContain(
      "exportsAllEpisodeManuscriptsOnlyExcludingCharacterStatePlot"
    );
    expect(source).toContain(
      "exportsAllEpisodeManuscriptsOnlyExcludingCharacterStatePlot"
    );
  });

  it("offers file exports and direct manuscript copying as selectable cards", () => {
    expectSourceToContain(source, "dOCXDocument");
    expectSourceToContain(source, "tXTPlainText");
    expectSourceToContain(source, "ePUBEbook");
    expect(source).toContain('id: "clipboard"');
    expect(source).toContain("copyManuscript");
    expect(source).toContain("copyTheFullManuscriptToPasteAnywhere");
    expect(source).toContain('type="radio"');
    expect(source).toContain('emit("export", selectedTarget.value)');
    expect(source).toContain("selectedTarget === 'clipboard'");
    expect(source).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr))"
    );
  });

  it("uses only the selected card border without an outer focus ring", () => {
    expect(source).toContain(".export-manuscript-format-card.is-selected");
    expect(source).not.toContain(".export-manuscript-format-card:focus-within");
  });
});
