import { describe, expect, it } from "vitest";
import controlsSource from "./SubagentAuthoringGenerateControls.vue?raw";
import source from "./LoadSubagentFromSkillDialog.vue?raw";
import treeSource from "./SkillTreeSelect.vue?raw";

describe("LoadSubagentFromSkillDialog", () => {
  it("keeps generation controls and progress feedback from shifting the form", () => {
    expect(controlsSource).toContain(
      'class="dialog-secondary-button authoring-stop-button"'
    );
    expect(controlsSource).toContain(
      ":class=\"{ 'is-placeholder': !generating }\""
    );
    expect(controlsSource).toContain('class="authoring-status-slot"');
    expect(controlsSource).toContain("height: 2.65rem;");
    expect(controlsSource).not.toContain(
      'v-if="generating"\n        type="button"'
    );
  });

  it("routes generation errors through floating feedback", () => {
    expect(source).toContain("uiMessage.error(error)");
    expect(source).not.toContain('class="error-text"');
  });

  it("offers every indexed skill as a tree and defers body loading until generation", () => {
    expect(source).toContain("<SkillTreeSelect");
    expect(source).toContain(
      "buildSubagentAuthoringSkillOptions(props.skills)"
    );
    expect(source).not.toContain("if (!entry.body.trim()) continue");
    expect(source).toContain("libraryId: skill.libraryId");
    expect(source).toContain("entryId: skill.entryId");
  });

  it("sends skills in the order they were picked", () => {
    expect(source).toContain("selectedSkillIds.value.flatMap");
  });

  it("uses the shared dialog buttons and picker menus", () => {
    expect(source).toContain('class="dialog-primary-button"');
    expect(source).toContain('class="dialog-secondary-button"');
    expect(source).not.toContain('class="primary-button"');
    expect(controlsSource).toContain("<PopupSelect");
    expect(source).not.toContain("<select");
  });
});

describe("SkillTreeSelect", () => {
  it("is a searchable library, stage and skill tree with removable picks", () => {
    expect(treeSource).toContain('type="search"');
    expect(treeSource).toContain(":aria-expanded=");
    expect(treeSource).toContain('type="checkbox"');
    expect(treeSource).toContain("emit('toggle', skill.id)");
    expect(treeSource).toContain('class="skill-chips"');
  });

  it("keeps browsing and searching expansion apart", () => {
    expect(treeSource).toContain("browseOpen");
    expect(treeSource).toContain("searchOpen");
  });
});
