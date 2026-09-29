import { formatError } from "../i18n/errors";
import { createScopedTranslator } from "../i18n";
import {
  CATALOG_PROJECT_MAX_CONTENT_ITEMS,
  type CatalogIndexSnapshot,
  type CatalogLibrary,
  type DeepWriteApi,
  type ExternalLibrarySelectionResult,
  type ExternalLibrarySourceKind
} from "@deepwrite/contracts";
import { ref, type Ref, type ShallowRef } from "vue";
import type { WorkspaceDocument } from "../types/workspace";

const t = createScopedTranslator("workspace.externalLibraryImportCoordinator");

export interface ExternalLibraryImportDialogState {
  domain: "material" | "skill";
  preselectedLibraryId?: string;
  selection?: ExternalLibrarySelectionResult;
}

export interface ExternalLibraryImportSubmitPayload {
  libraryId: string;
  candidateIds: string[];
}

interface ExternalLibraryImportNotifications {
  error(message: string): void;
  success(message: string): void;
  warning(message: string): void;
}

interface ExternalLibraryImportContext {
  api(): DeepWriteApi["catalog"] | undefined;
  snapshot: Readonly<Ref<CatalogIndexSnapshot | null>>;
  documents: ShallowRef<WorkspaceDocument[]>;
  mutationPending: Ref<boolean>;
  findLibrary(
    domain: "material" | "skill",
    libraryId: string
  ): CatalogLibrary | undefined;
  refreshCatalog(): Promise<boolean>;
  refreshWorkspaceDirectory(): Promise<void>;
  advanceDraftProjectRevision(
    domain: "material" | "skill",
    libraryId: string,
    expectedProjectRevision: number | undefined
  ): void;
  isConflict(error: unknown): boolean;
  selectDocument(documentId: string, revealEditor: boolean): void;
  notifications: ExternalLibraryImportNotifications;
}

export function useExternalLibraryImportCoordinator(
  context: ExternalLibraryImportContext
) {
  const dialog = ref<ExternalLibraryImportDialogState | null>(null);

  function open(
    domain: "material" | "skill",
    preselectedLibraryId?: string
  ): void {
    if (!context.api()) {
      context.notifications.warning(
        t("theBrowserPreviewCannotReadLocalFilesUseThe")
      );
      return;
    }
    dialog.value = {
      domain,
      ...(preselectedLibraryId ? { preselectedLibraryId } : {})
    };
  }

  function close(): void {
    if (!context.mutationPending.value) dialog.value = null;
  }

  async function chooseSource(
    sourceKind: ExternalLibrarySourceKind
  ): Promise<void> {
    const api = context.api();
    const current = dialog.value;
    if (!api || !current || context.mutationPending.value) return;
    context.mutationPending.value = true;
    try {
      const selection = await api.chooseExternalLibraryEntries(sourceKind);
      if (!selection) return;
      dialog.value = { ...current, selection };
      if (selection.candidates.length === 0) {
        context.notifications.warning(
          t("noImportableTextWasFoundAtTheSelectedLocation")
        );
      }
    } catch (error: unknown) {
      context.notifications.error(
        formatError(error, t("failedToScanExternalFiles"))
      );
    } finally {
      context.mutationPending.value = false;
    }
  }

  async function submit(
    payload: ExternalLibraryImportSubmitPayload
  ): Promise<void> {
    const api = context.api();
    const current = dialog.value;
    if (
      !api ||
      !current?.selection ||
      context.mutationPending.value ||
      payload.candidateIds.length === 0
    ) {
      return;
    }
    const library = context.findLibrary(current.domain, payload.libraryId);
    if (!library || ("isBuiltin" in library && library.isBuiltin)) {
      context.notifications.warning(
        t("theDestinationLibraryIsUnavailableOrReadOnly")
      );
      return;
    }
    const selectedIds = new Set(payload.candidateIds);
    const entries = current.selection.candidates
      .filter((candidate) => selectedIds.has(candidate.id))
      .map(({ title, content }) => ({ title, content }));
    if (entries.length === 0) return;
    if (
      library.entries.length + entries.length >
      CATALOG_PROJECT_MAX_CONTENT_ITEMS
    ) {
      context.notifications.warning(
        t("theSelectedEntriesExceedTheRemainingLibraryCapacity")
      );
      return;
    }

    context.mutationPending.value = true;
    try {
      const result = await api.importLibraryEntries({
        domain: current.domain,
        libraryId: library.id,
        entries,
        baseProjectRevision: library.projectRevision ?? 0
      });
      await context.refreshWorkspaceDirectory();
      await context.refreshCatalog();
      context.advanceDraftProjectRevision(
        current.domain,
        library.id,
        library.projectRevision === undefined
          ? undefined
          : library.projectRevision + 1
      );
      dialog.value = null;
      const firstEntry = result.entries[0];
      const target = context.documents.value.find(
        (document) =>
          document.libraryId === library.id &&
          document.catalogEntryId === firstEntry?.id
      );
      if (target) context.selectDocument(target.id, true);
      const renamedCount = result.entries.filter(
        (entry, index) => entry.title !== entries[index]?.title
      ).length;
      context.notifications.success(
        renamedCount > 0
          ? t("importedEntriesWereRenamedToAvoidDuplicates", {
              length: result.entries.length,
              renamedCount: renamedCount
            })
          : t("importedEntriesInto", {
              length: result.entries.length,
              title: library.title
            })
      );
    } catch (error: unknown) {
      if (context.isConflict(error)) {
        await context.refreshWorkspaceDirectory();
        await context.refreshCatalog();
        context.notifications.warning(
          t("theDestinationLibraryWasUpdatedExternallyDuplicateNamesHave")
        );
      } else {
        context.notifications.error(
          formatError(error, t("failedToImportMaterialsInBulk"))
        );
      }
    } finally {
      context.mutationPending.value = false;
    }
  }

  return { dialog, open, close, chooseSource, submit };
}
