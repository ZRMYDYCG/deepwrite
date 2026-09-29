import { describe, expect, it } from "vitest";
import { expectSourceToContain } from "../../../test-utils/sourceText";
import source from "./CreateLongVolumeDialog.vue?raw";

describe("CreateLongVolumeDialog", () => {
  it("uses a focused create form instead of the full structure manager", () => {
    expect(source).toContain("newVolume");
    expect(source).toContain("volumeName");
    expect(source).toContain("volumeOutline");
    expect(source).toContain("enterAVolumeName");
    expect(source).toContain('<Teleport to="body">');
    expect(source).not.toContain("LongStructureManager");
  });

  it("warns that creating from the manuscript tree also creates the plot outline", () => {
    expect(source).toContain('source?: "book-line" | "draft"');
    expect(source).toContain('props.source === "draft"');
    expectSourceToContain(source, "plotDesignOverallStoryline");
    expectSourceToContain(source, "aMatchingVolumeOutlineWillBeCreatedInThe");
    expect(source).toContain("creating");
    expect(source).not.toContain("is-danger");
  });

  it("submits the title and initial outline", () => {
    expect(source).toContain(
      "submit: [input: { title: string; summary: string }]"
    );
    expect(source).toContain("title: normalizedTitle");
    expect(source).toContain("summary: summary.value");
  });
});
