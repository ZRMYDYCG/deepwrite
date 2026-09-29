import { describe, expect, it } from "vitest";
import { expectSourceToContain } from "../../../test-utils/sourceText";
import source from "./CreateLongChapterCardDialog.vue?raw";

describe("CreateLongChapterCardDialog", () => {
  it("uses a focused create form instead of the full structure manager", () => {
    expect(source).toContain("newMessage");
    expect(source).toContain("chapterCardTitle");
    expect(source).toContain("sectionName");
    expect(source).toContain("linkedPlotPointOptional");
    expect(source).toContain("noLinkedPlotPoint");
    expect(source).toContain("enterValue");
    expect(source).toContain("<PopupSelect");
    expect(source).not.toContain("<select");
    expect(source).toContain('<Teleport to="body">');
    expect(source).not.toContain("LongStructureManager");
  });

  it("warns that creating a draft section also creates a chapter card", () => {
    expect(source).toContain('source?: "chapter-card" | "draft"');
    expect(source).toContain('props.source === "draft"');
    expect(source).toContain(
      "aMatchingChapterCardWillBeCreatedConsiderPreparing"
    );
    expectSourceToContain(
      source,
      "aMatchingChapterCardWillBeCreatedConsiderPreparing"
    );
    expect(source).toContain("youCanCompleteTheChapterCardAfterCreatingIt");
    expect(source).toContain("creating");
    expect(source).not.toContain("is-danger");
  });

  it("submits the title with an optional plot point", () => {
    expect(source).toContain(
      "submit: [input: { title: string; primaryArcId: string | null }]"
    );
    expect(source).toContain("title: normalizedTitle");
    expect(source).toContain("primaryArcId: primaryArcId.value || null");
    expect(source).toContain('primaryArcId.value = ""');
    expect(source).not.toContain("请选择主剧情点");
  });
});
