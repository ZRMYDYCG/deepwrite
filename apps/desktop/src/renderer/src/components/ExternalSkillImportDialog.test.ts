import { describe, expect, it } from "vitest";
import source from "./ExternalSkillImportDialog.vue?raw";
import treeSource from "./TreeNodeItem.vue?raw";
import importCoordinatorSource from "../composables/useExternalLibraryImportCoordinator.ts?raw";

describe("external library import UI", () => {
  it("offers multi-file and recursive directory choices", () => {
    expect(source).toContain("chooseFolder");
    expect(source).toContain("chooseFiles");
    expect(source).toContain(
      "supportsTXTMarkdownPDFAndWordDocumentsFoldersAre"
    );
    expect(source).toContain("emit('choose', 'directory')");
    expect(source).toContain("emit('choose', 'file')");
  });

  it("shows the action only for writable skill libraries", () => {
    expect(treeSource).toContain("loadFromOtherSkills");
    expect(treeSource).toContain(
      "libraryDomain === 'skill' && !node.readOnly && !node.unavailable"
    );
    expect(treeSource).toContain(
      "activateResourceNodeAction('import-external-skills')"
    );
  });

  it("previews titles only and submits selected candidate ids", () => {
    expect(source).toContain("candidate.title");
    expect(source).not.toContain("candidate.content");
    expect(source).toContain("selectedCandidateIds");
    expect(source).toContain("couldNotReadOrExtract");
    expect(importCoordinatorSource).toContain(
      "api.chooseExternalLibraryEntries(sourceKind)"
    );
    expect(importCoordinatorSource).toContain("api.importLibraryEntries({");
  });
});
