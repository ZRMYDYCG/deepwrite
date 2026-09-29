import { describe, expect, it } from "vitest";
import source from "./LibraryGroupDialog.vue?raw";

describe("LibraryGroupDialog default library option", () => {
  it("offers creating a default library when existing ones are unavailable", () => {
    expect(source).toContain("createDefaultLibrary");
    expect(source).toContain("CREATE_DEFAULT_LIBRARY_VALUE");
    expect(source).toContain("catalog.createLibrary");
    expect(source).toContain("chooseAtMostOneExistingLibraryPerMessage");
  });

  it("supports both material and skill kind labels for default names", () => {
    expect(source).toContain("characterMaterialLibrary");
    expect(source).toContain("generalSkillLibrary");
    expect(source).toContain("defaultLibraryName");
  });

  it("allows updating a group's name together with its bindings", () => {
    expect(source).toContain("title: name");
    expect(source).toContain("editGroup");
    expect(source).toContain('v-model="title"');
  });

  it("groups libraries without separating them by historical writing type", () => {
    expect(source).not.toContain('library.materialType === "short"');
    expect(source).not.toContain('library.skillType === "short"');
  });
});
