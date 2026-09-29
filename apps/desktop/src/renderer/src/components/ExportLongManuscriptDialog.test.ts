import { describe, expect, it } from "vitest";
import { expectSourceToContain } from "../../../test-utils/sourceText";
import dialogSource from "./ExportLongManuscriptDialog.vue?raw";
import chapterListSource from "./ExportLongManuscriptChapterList.vue?raw";

describe("ExportLongManuscriptDialog", () => {
  it("offers all four selectable long-form export sections", () => {
    expect(dialogSource).toContain('id: "worldbuilding"');
    expect(dialogSource).toContain('id: "characters"');
    expect(dialogSource).toContain('id: "plot"');
    expect(dialogSource).toContain('id: "manuscript"');
    expect(dialogSource).toContain(
      "selectedContentExportsToOneFolderAsTXTFiles"
    );
    expect(dialogSource).toContain("selectOneOrMoreChaptersEachExportsAsA");
    expect(dialogSource).toContain('type="radio"');
    expect(dialogSource).toContain("mode: mode.value");
    expect(dialogSource).toContain("selectedContentExportsToOneTXTFile");
  });

  it("emits the selected sections together with manuscript chapter ids", () => {
    expectSourceToContain(
      dialogSource,
      "export: [request: LongManuscriptExportRequest]"
    );
    expect(dialogSource).toContain("manuscriptChapterCardIds");
    expect(dialogSource).toContain("<ExportLongManuscriptChapterList");
    expect(dialogSource).toContain('v-if="manuscriptSelected"');
    expect(dialogSource).toContain("getWorkspaceIndex");
    expect(dialogSource).toContain("listLongManuscriptExportChapters");
    expect(dialogSource).toContain("uiMessage.error");
    expect(dialogSource).not.toContain(
      'import("../utils/longManuscriptExport"'
    );
  });
});

describe("ExportLongManuscriptChapterList", () => {
  it("lets users select one chapter, many chapters, or a whole volume", () => {
    expect(chapterListSource).toContain("selectManuscriptChapters");
    expect(chapterListSource).toContain("selectAll");
    expect(chapterListSource).toContain("deselectAll");
    expect(chapterListSource).toContain("toggleVolume");
    expect(chapterListSource).toContain("toggleChapter");
    expect(chapterListSource).toContain('type="checkbox"');
    expect(chapterListSource).not.toContain("<select");
    expect(chapterListSource).toContain("longManuscriptExportChapters");
  });
});
