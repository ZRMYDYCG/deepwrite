import { describe, expect, it } from "vitest";
import source from "./LoadSubagentFromSkillDialog.vue?raw";

describe("LoadSubagentFromSkillDialog", () => {
  it("keeps generation controls and progress feedback from shifting the form", () => {
    expect(source).toContain('class="secondary-button authoring-stop-button"');
    expect(source).toContain(":class=\"{ 'is-placeholder': !generating }\"");
    expect(source).toContain('class="authoring-status-slot"');
    expect(source).toContain("height: 2.65rem;");
    expect(source).not.toContain(
      'v-if="generating"\n                type="button"'
    );
  });

  it("routes generation errors through floating feedback", () => {
    expect(source).toContain("uiMessage.error(error)");
    expect(source).not.toContain('class="error-text"');
  });

  it("offers every indexed skill and defers body loading until generation", () => {
    expect(source).not.toContain("showAllStages");
    expect(source).not.toContain("if (!entry.body.trim()) continue");
    expect(source).toContain("chooseSkillsFromAnyLibraryOrStageTheirContent");
    expect(source).toContain("libraryId: skill.libraryId");
    expect(source).toContain("entryId: skill.entryId");
  });
});
