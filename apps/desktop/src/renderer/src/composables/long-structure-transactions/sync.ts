import { formatError, getErrorCode } from "../../i18n/errors";
import { createScopedTranslator } from "../../i18n";
import type {
  LongWorkspaceImpactConfirmation,
  LongWorkspaceIndexSnapshot,
  LongWorkspaceOperationBatch
} from "@deepwrite/contracts";
import { longWorkspaceOperationsRequireImpactConfirmation } from "@deepwrite/contracts/renderer";
import {
  replaceLongBookSummary,
  type LongStructureMutationCompletion,
  type LongWorldbuildingSyncCompletion,
  type LongWorldbuildingSyncRequest
} from "../../types/longWorkspace";
import type { LongStructureLease } from "./lease";
import type { LongStructureMutationLease } from "./types";

const t = createScopedTranslator("workspace");

const LONG_STRUCTURE_PREVIEW_TIMEOUT_MS = 15_000;

async function previewWithTimeout<T>(preview: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      preview,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                t("sync.checkingLongFormStructureImpactTimedOutTryAgain")
              )
            ),
          LONG_STRUCTURE_PREVIEW_TIMEOUT_MS
        );
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function createLongStructureSync(
  host: LongStructureLease,
  _loadLongStructureMutationModule: () => Promise<
    typeof import("../../types/longStructureMutations")
  >
) {
  const {
    uiMessage,
    resources,
    session,
    state,
    resolveLongWorkspaceApi,
    isDisposed,
    captureLongStructureMutationTarget,
    mutationIsCurrent,
    assertCurrentLongStructureMutationTarget,
    withMutation
  } = host;
  const {
    longBooks,
    activeBookId: activeLongBookId,
    activeBookSummary: activeLongBookSummary,
    workspaceIndex: activeLongWorkspaceIndex,
    selection: activeLongSelection,
    structureDialogOpen: longStructureDialogOpen
  } = state;
  const {
    saveActiveEditorChanges: saveActiveLongEditorChanges,
    refreshActiveWorkspace: refreshActiveLongWorkspace,
    refreshWorkspaceAfterProposal: refreshLongProposalWorkspace,
    editor: longWorkspaceEditor
  } = session;

  async function handleLongWorldbuildingSync(
    payload: LongWorldbuildingSyncRequest,
    completion: LongWorldbuildingSyncCompletion
  ): Promise<void> {
    const expectedBookId = activeLongBookSummary.value?.id;
    await withMutation(
      expectedBookId,
      (message) => {
        uiMessage.warning(message);
        completion.fail(message);
      },
      async (lease) => {
        const api = resolveLongWorkspaceApi();
        const summary = activeLongBookSummary.value;
        const index = activeLongWorkspaceIndex.value;
        if (!api || !summary || !index) {
          const message = t(
            "longBookLifecycleCoordinator.theCurrentNovelStructureIsNotReady"
          );
          uiMessage.warning(message);
          completion.fail(message);
          return;
        }
        if (payload.sourceBookId === summary.id) {
          const message = t("sync.aLongFormProjectCannotSyncFromItself");
          uiMessage.warning(message);
          completion.fail(message);
          return;
        }
        try {
          if (payload.prepared) {
            await executeLongStructureMutation(
              lease,
              payload.prepared.batch,
              completion,
              {
                successMessage: t("sync.syncedWorldbuildingFromCategories", {
                  sourceTitle: payload.sourceTitle,
                  createdCategoryCount: payload.prepared.createdCategoryCount
                }),
                expectedImpact: payload.prepared.confirmation
              }
            );
            return;
          }
          const {
            buildLongWorldbuildingSyncBatch,
            filterSyncableWorldbuildingCategories,
            loadSourceWorldbuildingContents
          } = await import("../../utils/longWorldbuildingSync");
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          if (!(await saveActiveLongEditorChanges())) {
            completion.fail(t("sync.theCurrentLongFormChangesAreStillUnsaved"));
            return;
          }
          if (!mutationIsCurrent(lease)) return;
          if (!captureLongStructureMutationTarget(lease.target.bookId)) {
            throw new Error(
              t("sync.theActiveLongFormProjectChangedTheWorldbuildingSync")
            );
          }
          if (!(await refreshActiveLongWorkspace(lease.target.bookId))) {
            throw new Error(
              t("sync.couldNotSyncTheLatestLongFormStructureThese")
            );
          }
          if (!mutationIsCurrent(lease)) return;
          const latestTarget = captureLongStructureMutationTarget(
            lease.target.bookId
          );
          const latestIndex = latestTarget?.index;
          if (!latestTarget || !latestIndex) {
            throw new Error(
              t("sync.theActiveLongFormProjectChangedTheWorldbuildingSync")
            );
          }
          const source = await api.getWorkspaceIndex({
            bookId: payload.sourceBookId
          });
          assertCurrentLongStructureMutationTarget(
            latestTarget,
            lease,
            t("sync.theActiveLongFormProjectOrStructureChangedThe")
          );
          if (source.bookId !== payload.sourceBookId) {
            throw new Error(
              t("sync.theLoadedSourceLongFormWorkspaceDoesNotMatch")
            );
          }
          const sourceCategories = filterSyncableWorldbuildingCategories(
            source.workspaceIndex.worldbuilding
          );
          if (sourceCategories.length === 0) {
            throw new Error(
              t(
                "longWorldbuildingSync.theSelectedNovelHasNoWorldbuildingCategoriesToSync"
              )
            );
          }
          const contents = await loadSourceWorldbuildingContents(
            (input) => api.readDocument(input),
            payload.sourceBookId,
            sourceCategories
          );
          assertCurrentLongStructureMutationTarget(
            latestTarget,
            lease,
            t("sync.theActiveLongFormProjectOrStructureChangedThe")
          );
          const plan = await buildLongWorldbuildingSyncBatch({
            target: latestIndex,
            source: source.workspaceIndex,
            contents
          });
          assertCurrentLongStructureMutationTarget(
            latestTarget,
            lease,
            t("sync.theActiveLongFormProjectOrStructureChangedThe")
          );
          const confirmation = await previewLongStructureImpact(
            lease.target.bookId,
            plan.batch
          );
          assertCurrentLongStructureMutationTarget(
            latestTarget,
            lease,
            t("sync.theActiveLongFormProjectOrStructureChangedThe2")
          );
          completion.review({
            batch: plan.batch,
            confirmation,
            createdCategoryCount: plan.createdCategoryCount,
            deletedCategoryCount: plan.deletedCategoryCount,
            writtenFileCount: plan.writtenFileCount
          });
        } catch (error: unknown) {
          if (isDisposed()) return;
          const message = formatError(
            error,
            t("sync.couldNotSyncWorldbuilding")
          );
          completion.fail(message);
          uiMessage.error(message);
        }
      }
    );
  }

  async function executeLongStructureMutation(
    lease: LongStructureMutationLease,
    batch: LongWorkspaceOperationBatch,
    completion: LongStructureMutationCompletion,
    options: {
      saveEditor?: boolean;
      successMessage?: string;
      expectedImpact?: LongWorkspaceImpactConfirmation;
      onImpactChanged?: (impact: LongWorkspaceImpactConfirmation) => void;
    } = {},
    _beforeIndex: LongWorkspaceIndexSnapshot = lease.target.index
  ): Promise<void> {
    const workspaceApi = resolveLongWorkspaceApi();
    if (!workspaceApi || !mutationIsCurrent(lease)) {
      if (!isDisposed()) {
        const message = t(
          "longBookLifecycleCoordinator.theCurrentNovelStructureIsNotReady"
        );
        uiMessage.warning(message);
        completion.fail(message);
      }
      return;
    }
    const expectedBookId = lease.target.bookId;
    const updatesItemLayout = batch.operations.some(
      (operation) => operation.type === "featureSettings.update"
    );
    if (updatesItemLayout && activeLongSelection.value) {
      activeLongSelection.value = {
        ...activeLongSelection.value,
        ...longWorkspaceEditor.value?.captureNavigationSelection()
      };
    }
    if (
      options.saveEditor !== false &&
      !(await saveActiveLongEditorChanges())
    ) {
      if (mutationIsCurrent(lease))
        completion.fail(t("sync.theCurrentLongFormChangesAreStillUnsaved"));
      return;
    }
    if (!mutationIsCurrent(lease)) return;
    if (!captureLongStructureMutationTarget(expectedBookId)) {
      const message = t(
        "sync.theActiveLongFormProjectChangedTheseStructureChanges"
      );
      completion.fail(message);
      uiMessage.warning(message);
      return;
    }
    let previewImpact: LongWorkspaceImpactConfirmation | null = null;
    try {
      if (!(await refreshActiveLongWorkspace(expectedBookId))) {
        throw new Error(t("sync.couldNotSyncTheLatestLongFormStructureThese"));
      }
      if (!mutationIsCurrent(lease)) return;
      const latestTarget = captureLongStructureMutationTarget(expectedBookId);
      const latestIndex = latestTarget?.index;
      if (
        !latestTarget ||
        !latestIndex ||
        activeLongBookSummary.value?.id !== expectedBookId
      ) {
        throw new Error(
          t("sync.theActiveLongFormProjectChangedTheseStructureChanges")
        );
      }
      assertCurrentLongStructureMutationTarget(latestTarget, lease);
      const { expectedImpact: batchExpectedImpact, ...unconfirmedBatch } =
        batch;
      const confirmedImpact = options.expectedImpact ?? batchExpectedImpact;
      const preview = await previewWithTimeout(
        workspaceApi.previewOperations({
          bookId: expectedBookId,
          batch: unconfirmedBatch
        })
      );
      assertCurrentLongStructureMutationTarget(latestTarget, lease);
      if (preview.bookId !== expectedBookId) {
        throw new Error(
          t("sync.theStructureImpactPreviewReturnedADifferentLongForm")
        );
      }
      previewImpact = preview.preview.confirmation;
      assertCurrentLongStructureMutationTarget(latestTarget, lease);
      if (
        longWorkspaceOperationsRequireImpactConfirmation(
          batch.operations,
          previewImpact
        ) &&
        !confirmedImpact
      ) {
        const message = t(
          "sync.reviewTheRelationshipsAndDeletionImpactBeforeConfirming"
        );
        options.onImpactChanged?.(previewImpact);
        completion.fail(message, previewImpact);
        uiMessage.warning(message);
        return;
      }
      const applyResult = await workspaceApi.applyOperations({
        bookId: expectedBookId,
        batch: {
          ...batch,
          expectedImpact: confirmedImpact ?? preview.preview.confirmation
        }
      });
      lease.applied = true;
      if (isDisposed()) return;
      if (
        applyResult.bookId !== expectedBookId ||
        activeLongBookId.value !== expectedBookId ||
        activeLongBookSummary.value?.id !== expectedBookId
      ) {
        throw new Error(
          t("sync.theActiveLongFormProjectChangedTheSavedStructure")
        );
      }
      longBooks.value = replaceLongBookSummary(
        longBooks.value,
        applyResult.summary
      );
      const refreshed = await refreshLongProposalWorkspace(expectedBookId);
      if (isDisposed()) return;
      if (!refreshed) {
        longStructureDialogOpen.value = false;
        completion.appliedButRefreshFailed(
          t("sync.structureChangesWereSavedButTheInterfaceCouldNot")
        );
        uiMessage.warning(
          t("sync.structureChangesWereSavedButTheInterfaceCouldNot2")
        );
        return;
      }
      if (updatesItemLayout) {
        resources.synchronizeSelectedResourceForLayout(expectedBookId);
      }
      completion.succeed();
      uiMessage.success(
        options.successMessage ??
          t("sync.savedLongFormStructureChangesDirectly", {
            length: batch.operations.length
          })
      );
    } catch (error: unknown) {
      if (isDisposed()) return;
      const rawMessage = formatError(
        error,
        t("sync.couldNotSaveLongFormStructureChanges")
      );
      const message =
        getErrorCode(error) === "long.operation.impact_mismatch"
          ? t("sync.relationshipsHaveChangedReviewTheLatestImpactAndConfirm")
          : rawMessage;
      if (message !== rawMessage && previewImpact) {
        options.onImpactChanged?.(previewImpact);
      }
      if (lease.applied) {
        longStructureDialogOpen.value = false;
        completion.appliedButRefreshFailed(message);
      } else {
        completion.fail(
          message,
          message === rawMessage ? undefined : (previewImpact ?? undefined)
        );
      }
      if (message === rawMessage) uiMessage.error(message);
      else uiMessage.warning(message);
    }
  }

  async function previewLongStructureImpact(
    bookId: string,
    batch: LongWorkspaceOperationBatch
  ): Promise<LongWorkspaceImpactConfirmation> {
    const workspaceApi = resolveLongWorkspaceApi();
    if (!workspaceApi) {
      throw new Error(
        t("longBookLifecycleCoordinator.theCurrentNovelStructureIsNotReady")
      );
    }
    const { expectedImpact: _expectedImpact, ...unconfirmedBatch } = batch;
    const preview = await previewWithTimeout(
      workspaceApi.previewOperations({
        bookId,
        batch: unconfirmedBatch
      })
    );
    if (preview.bookId !== bookId) {
      throw new Error(
        t("sync.theStructureImpactPreviewReturnedADifferentLongForm")
      );
    }
    return preview.preview.confirmation;
  }

  return {
    handleLongWorldbuildingSync,
    executeLongStructureMutation,
    previewLongStructureImpact
  };
}

export type LongStructureSync = ReturnType<typeof createLongStructureSync>;
