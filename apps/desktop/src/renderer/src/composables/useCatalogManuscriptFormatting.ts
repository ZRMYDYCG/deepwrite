import type { BodyTextFormat } from "@deepwrite/contracts";
import { getCurrentScope, onScopeDispose, ref, type ShallowRef } from "vue";
import { createScopedTranslator } from "../i18n";
import type { EditorDraftState, WorkspaceDocument } from "../types/workspace";
import { uiMessage } from "../ui-feedback";
import { formatBodyText } from "../utils/bodyTextFormat";

const t = createScopedTranslator("workspace.bodyTextFormatting");

type CatalogBodyKind = "short" | "script";

interface FormattedDocument {
  id: string;
  title: string;
  content: string;
}

export interface CatalogManuscriptFormattingOptions {
  documents: Readonly<ShallowRef<WorkspaceDocument[]>>;
  drafts: Readonly<ShallowRef<Record<string, EditorDraftState>>>;
  ensureLoaded(documentIds: readonly string[]): Promise<{ ok: boolean }>;
  isWriteBlocked(documents: readonly WorkspaceDocument[]): boolean;
  stage(changes: readonly FormattedDocument[]): void;
  scheduleAutoSave(documentId: string): void;
}

function manuscriptBodies(
  documents: readonly WorkspaceDocument[],
  workspaceId: string,
  kind: CatalogBodyKind
): WorkspaceDocument[] {
  return documents.filter(
    (document) =>
      document.domain === "creation" &&
      document.workspaceId === workspaceId &&
      document.workspaceType === kind &&
      document.draftFileKind === "body"
  );
}

function sameDocumentIds(
  before: readonly WorkspaceDocument[],
  after: readonly WorkspaceDocument[]
): boolean {
  return (
    before.length === after.length &&
    before.every((document, index) => document.id === after[index]?.id)
  );
}

export function useCatalogManuscriptFormatting(
  options: CatalogManuscriptFormattingOptions
) {
  const pending = ref(false);
  let disposed = false;
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
    });

  async function formatAll(
    workspaceId: string,
    kind: CatalogBodyKind,
    format: BodyTextFormat
  ): Promise<void> {
    if (disposed || pending.value) return;
    const initial = manuscriptBodies(
      options.documents.value,
      workspaceId,
      kind
    );
    if (!initial.length || options.isWriteBlocked(initial)) {
      uiMessage.warning(t("finishOtherEditsBeforeFormattingAllBodies"));
      return;
    }
    pending.value = true;
    try {
      const loaded = await options.ensureLoaded(initial.map(({ id }) => id));
      const current = manuscriptBodies(
        options.documents.value,
        workspaceId,
        kind
      );
      if (disposed) return;
      if (
        !loaded.ok ||
        !sameDocumentIds(initial, current) ||
        current.some((document) => document.catalogContentLoaded === false)
      ) {
        uiMessage.error(t("couldNotReadEveryBodyNoChangesWereMade"));
        return;
      }
      if (options.isWriteBlocked(current)) {
        uiMessage.warning(t("finishOtherEditsBeforeFormattingAllBodies"));
        return;
      }

      const changes = current.flatMap((document) => {
        const draft = options.drafts.value[document.id];
        const content = draft?.content ?? document.content;
        const formatted = formatBodyText(content, format);
        return formatted === content
          ? []
          : [
              {
                id: document.id,
                title: draft?.title ?? document.title,
                content: formatted
              }
            ];
      });
      if (!changes.length) {
        uiMessage.info(t("allBodiesAlreadyMatchTheFormattingRules"));
        return;
      }
      options.stage(changes);
      for (const change of changes) options.scheduleAutoSave(change.id);
      uiMessage.success(t("formattedBodies", { count: changes.length }));
    } catch {
      uiMessage.error(t("couldNotFormatAllBodiesTryAgain"));
    } finally {
      pending.value = false;
    }
  }

  return { pending, formatAll };
}
