import { createScopedTranslator } from "../i18n";
import { ref } from "vue";
import { PROMPT_ATTACHMENT_MAX_ITEMS } from "@deepwrite/contracts";
import type { EditorTextReference } from "../types/conversation";

const t = createScopedTranslator("workspace.pendingEditorReferences");

export interface PendingEditorReferenceNotifications {
  info(message: string): void;
  warning(message: string): void;
}

export function usePendingEditorReferences(
  notifications: PendingEditorReferenceNotifications,
  options: {
    existingReferences?(): readonly EditorTextReference[];
  } = {}
) {
  const editorReferences = ref<EditorTextReference[]>([]);

  function insertEditorReference(reference: EditorTextReference): void {
    const existingReferences = options.existingReferences?.() ?? [];
    const duplicate = [...existingReferences, ...editorReferences.value].some(
      (item) =>
        item.documentId === reference.documentId &&
        item.start === reference.start &&
        item.end === reference.end &&
        item.text === reference.text
    );
    if (duplicate) {
      notifications.info(t("thisPassageIsAlreadyInTheInput"));
      return;
    }
    if (
      existingReferences.length + editorReferences.value.length >=
      PROMPT_ATTACHMENT_MAX_ITEMS
    ) {
      notifications.warning(
        t("eachMessageCanIncludeUpToManuscriptReferences", {
          PROMPT_ATTACHMENT_MAX_ITEMS: PROMPT_ATTACHMENT_MAX_ITEMS
        })
      );
      return;
    }
    editorReferences.value = [...editorReferences.value, reference];
  }

  function removeEditorReference(referenceId: string): void {
    editorReferences.value = editorReferences.value.filter(
      ({ id }) => id !== referenceId
    );
  }

  function clearEditorReferences(): void {
    editorReferences.value = [];
  }

  return {
    editorReferences,
    insertEditorReference,
    removeEditorReference,
    clearEditorReferences
  };
}
