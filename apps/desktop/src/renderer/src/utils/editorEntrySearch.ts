import { createScopedTranslator } from "../i18n";
import type { EditorEntrySearchSource } from "../types/editorEntrySearch";
import type { WorkspaceDocument } from "../types/workspace";

const t = createScopedTranslator("workspace.editorEntrySearch");

function searchEntryTitle(document: WorkspaceDocument): string {
  if (document.draftFileKind === "body")
    return t("manuscript", {
      title: document.title
    });
  if (document.draftFileKind === "character-state") {
    return t("characterState", {
      title: document.title
    });
  }
  if (document.characterFileKind === "overview") return t("characterOverview");
  return document.title;
}

export function editorEntrySearchDocuments(
  documents: readonly WorkspaceDocument[],
  active: WorkspaceDocument
): WorkspaceDocument[] {
  const matchesScope = (candidate: WorkspaceDocument): boolean => {
    if (active.libraryId) return candidate.libraryId === active.libraryId;
    if (active.workspaceId && active.stageId) {
      return (
        candidate.workspaceId === active.workspaceId &&
        candidate.stageId === active.stageId
      );
    }
    return candidate.id === active.id;
  };

  return documents.filter(matchesScope);
}

export function editorEntrySearchSources(
  documents: readonly WorkspaceDocument[],
  active: WorkspaceDocument
): EditorEntrySearchSource[] {
  return editorEntrySearchDocuments(documents, active).map((document) => ({
    id: document.id,
    title: searchEntryTitle(document),
    content: document.content
  }));
}
