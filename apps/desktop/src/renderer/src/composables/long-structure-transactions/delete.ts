import { formatError } from "../../i18n/errors";
import { createScopedTranslator } from "../../i18n";
import type {
  LongWorkspaceImpactConfirmation,
  LongWorkspaceOperationBatch
} from "@deepwrite/contracts";
import { nextTick } from "vue";
import { longDeletionDescription } from "../../utils/longDeletionImpact";
import { longImpactConfirmationDescription } from "../../utils/longImpactConfirmation";
import { selectAfterLongDraftSectionDelete } from "./draft-delete-selection";
import type { LongStructureLease } from "./lease";
import {
  buildLongNavigationDeleteBatch,
  createLongNavigationDeletePreviewTimes,
  type LongNavigationDeletion
} from "./navigation-delete-batch";
import type { LongStructureSync } from "./sync";
import { isActiveLongTreeItem, resolveLongTreeItemDetails } from "./tree";

const t = createScopedTranslator("workspace");

type MutationModule = typeof import("../../types/longStructureMutations");

export function createLongStructureDelete(
  host: LongStructureLease,
  sync: LongStructureSync,
  loadLongStructureMutationModule: () => Promise<MutationModule>
) {
  const {
    uiMessage,
    resources,
    session,
    state,
    isDisposed,
    assertCurrentLongStructureMutationTarget,
    withMutation,
    runTracked,
    mutationIsCurrent
  } = host;
  const { executeLongStructureMutation } = sync;
  const {
    activeBookId: activeLongBookId,
    activeBookSummary: activeLongBookSummary,
    workspaceIndex: activeLongWorkspaceIndex,
    selection: activeLongSelection,
    draftSectionDeleteTarget: longDraftSectionDelete,
    treeItemDeleteTarget: longTreeItemDelete,
    selectedResourceId
  } = state;
  const { selectWorkspaceFile: selectLongWorkspaceFile } = session;
  const resourceNode = resources.node;
  const selectResource = resources.select;
  const navigationDeletePreviewTimes = createLongNavigationDeletePreviewTimes();

  async function confirmDeleteLongTreeItem(): Promise<void> {
    const pending = longTreeItemDelete.value;
    const target = pending?.node.longTreeItem;
    if (!pending || !target) return;
    await withMutation(
      pending.bookId,
      (message) => uiMessage.info(message),
      async (lease) => {
        const index = lease.target.index;
        const details = resolveLongTreeItemDetails(
          pending.bookId,
          index,
          pending.node
        );
        if (!details) {
          if (longTreeItemDelete.value === pending) {
            longTreeItemDelete.value = null;
          }
          uiMessage.warning(
            t("delete.thisEntryNoLongerExistsRefreshAndTryAgain")
          );
          return;
        }
        const currentIndex = details.orderedIds.indexOf(target.id);
        const fallbackItemId =
          details.orderedIds[currentIndex + 1] ??
          details.orderedIds[currentIndex - 1];
        const fallbackResourceId = fallbackItemId
          ? details.resourceIdForItem(fallbackItemId)
          : details.parentResourceId;
        const deletedSelected =
          selectedResourceId.value === pending.node.id ||
          isActiveLongTreeItem(pending.node, activeLongSelection.value);
        let batch: LongWorkspaceOperationBatch;
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          const builder = createLongStructureMutationBuilder(index, {
            now: () => pending.operationUpdatedAt
          });
          if (target.kind === "worldbuilding-item") {
            if (!target.parentId)
              throw new Error(t("delete.theWorldbuildingCategoryIdIsMissing"));
            batch = builder.deleteWorldbuildingItem(target.parentId, target.id);
          } else if (target.kind === "character") {
            batch = builder.deleteCharacter(target.id);
          } else if (target.kind === "volume") {
            batch = builder.deleteVolume(target.id);
          } else if (target.kind === "plot-point") {
            batch = builder.deleteArc(target.id);
          } else {
            batch = builder.deleteChapter(target.id);
          }
        } catch (error: unknown) {
          if (isDisposed()) return;
          uiMessage.warning(
            formatError(
              error,
              t("delete.couldNotDelete", { title: details.title })
            )
          );
          return;
        }
        let succeeded = false;
        let applied = false;
        await executeLongStructureMutation(
          lease,
          batch,
          {
            succeed: () => {
              succeeded = true;
              applied = true;
            },
            fail: () => undefined,
            appliedButRefreshFailed: () => {
              applied = true;
            }
          },
          {
            successMessage: t("delete.deleted", {
              label: details.label,
              title: details.title
            }),
            expectedImpact: pending.expectedImpact,
            onImpactChanged: (expectedImpact) => {
              const latestIndex = activeLongWorkspaceIndex.value;
              const latestDetails = latestIndex
                ? resolveLongTreeItemDetails(
                    pending.bookId,
                    latestIndex,
                    pending.node
                  )
                : null;
              if (longTreeItemDelete.value !== pending || !latestDetails)
                return;
              longTreeItemDelete.value = {
                ...pending,
                description: longImpactConfirmationDescription(
                  expectedImpact,
                  latestDetails.description
                ),
                expectedImpact
              };
            }
          },
          index
        );
        if (!applied || isDisposed()) return;
        if (longTreeItemDelete.value === pending) {
          longTreeItemDelete.value = null;
        }
        if (!succeeded || !deletedSelected || !mutationIsCurrent(lease)) return;
        await nextTick();
        if (!mutationIsCurrent(lease)) return;
        const fallbackNode = resourceNode(fallbackResourceId);
        if (fallbackNode) await selectResource(fallbackNode);
      }
    );
  }

  async function deleteLongNavigationStructure(
    expectedBookId: string,
    input: {
      kind: "character" | "volume" | "plotPoint" | "chapterCard";
      id: string;
      title: string;
      expectedImpact: LongWorkspaceImpactConfirmation;
      operationUpdatedAt?: string;
    },
    completion: (
      succeeded: boolean,
      changedImpact?: LongWorkspaceImpactConfirmation
    ) => void,
    isTargetCurrent: () => boolean = () => true
  ): Promise<void> {
    await withMutation(
      expectedBookId,
      (message) => {
        uiMessage.warning(message);
        completion(false);
      },
      async (lease) => {
        const index = lease.target.index;
        let deletion: LongNavigationDeletion;
        try {
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          if (!isTargetCurrent()) {
            throw new Error(
              t("delete.theDeletionTargetChangedThisOperationWasCanceled")
            );
          }
          const previewedAt =
            input.operationUpdatedAt ??
            navigationDeletePreviewTimes.timestampFor(expectedBookId, input);
          deletion = await buildLongNavigationDeleteBatch(
            loadLongStructureMutationModule,
            index,
            input,
            previewedAt
          );
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          if (!isTargetCurrent()) {
            throw new Error(
              t("delete.theDeletionTargetChangedThisOperationWasCanceled")
            );
          }
        } catch (error: unknown) {
          if (isDisposed()) return;
          uiMessage.warning(
            formatError(
              error,
              t("delete.couldNotDelete", { title: input.title })
            )
          );
          completion(false);
          return;
        }
        let changedImpact: LongWorkspaceImpactConfirmation | undefined;
        await executeLongStructureMutation(
          lease,
          deletion.batch,
          {
            succeed: () => {
              navigationDeletePreviewTimes.clear(expectedBookId, input);
              completion(true);
            },
            fail: () => completion(false, changedImpact),
            appliedButRefreshFailed: () => {
              navigationDeletePreviewTimes.clear(expectedBookId, input);
              completion(true);
            }
          },
          {
            successMessage: t("delete.deleted", {
              label: deletion.label,
              title: deletion.title
            }),
            expectedImpact: input.expectedImpact,
            onImpactChanged: (impact) => {
              changedImpact = impact;
            }
          },
          index
        );
      }
    );
  }

  async function confirmDeleteLongDraftSection(): Promise<void> {
    const pending = longDraftSectionDelete.value;
    if (!pending) return;
    await deleteLongNavigationStructure(
      pending.bookId,
      {
        kind: "chapterCard",
        id: pending.chapterCardId,
        title: pending.title,
        expectedImpact: pending.expectedImpact,
        operationUpdatedAt: pending.operationUpdatedAt
      },
      (succeeded, changedImpact) => {
        if (!succeeded && changedImpact) {
          const latestIndex = activeLongWorkspaceIndex.value;
          if (latestIndex && longDraftSectionDelete.value === pending) {
            longDraftSectionDelete.value = {
              ...pending,
              description: longImpactConfirmationDescription(
                changedImpact,
                longDeletionDescription(
                  latestIndex,
                  "chapterCard",
                  pending.chapterCardId
                )
              ),
              expectedImpact: changedImpact
            };
          }
          return;
        }
        if (!succeeded || isDisposed()) return;
        if (longDraftSectionDelete.value === pending) {
          longDraftSectionDelete.value = null;
        }
        selectAfterLongDraftSectionDelete({
          pending,
          summary: activeLongBookSummary.value,
          index: activeLongWorkspaceIndex.value,
          selectedChapterCardId:
            activeLongSelection.value?.chapterCardId ?? undefined,
          selectedResourceId,
          selectWorkspaceFile: selectLongWorkspaceFile,
          runTracked,
          isDisposed,
          reportError: (message) => uiMessage.error(message)
        });
      },
      () => longDraftSectionDelete.value === pending
    );
  }

  async function deleteActiveLongNavigationStructure(
    input: {
      kind: "character" | "volume" | "plotPoint" | "chapterCard";
      id: string;
      title: string;
      expectedImpact: LongWorkspaceImpactConfirmation;
    },
    completion: (
      succeeded: boolean,
      changedImpact?: LongWorkspaceImpactConfirmation
    ) => void
  ): Promise<void> {
    const expectedBookId = activeLongBookId.value;
    if (!expectedBookId) {
      uiMessage.warning(
        t("longBookLifecycleCoordinator.theCurrentNovelStructureIsNotReady")
      );
      completion(false);
      return;
    }
    await deleteLongNavigationStructure(expectedBookId, input, completion);
  }

  async function previewActiveLongNavigationStructure(
    input: {
      kind: "character" | "volume" | "plotPoint" | "chapterCard";
      id: string;
      title: string;
    },
    completion: (impact?: LongWorkspaceImpactConfirmation) => void
  ): Promise<void> {
    const expectedBookId = activeLongBookId.value;
    const index = activeLongWorkspaceIndex.value;
    if (!expectedBookId || !index) {
      uiMessage.warning(
        t("longBookLifecycleCoordinator.theCurrentNovelStructureIsNotReady")
      );
      completion();
      return;
    }
    await runTracked(async () => {
      try {
        const deletion = await buildLongNavigationDeleteBatch(
          loadLongStructureMutationModule,
          index,
          input
        );
        if (
          isDisposed() ||
          activeLongBookId.value !== expectedBookId ||
          activeLongWorkspaceIndex.value !== index
        ) {
          completion();
          return;
        }
        const previewRequest = navigationDeletePreviewTimes.begin(
          expectedBookId,
          input
        );
        const impact = await sync.previewLongStructureImpact(
          expectedBookId,
          deletion.batch
        );
        if (
          isDisposed() ||
          activeLongBookId.value !== expectedBookId ||
          activeLongWorkspaceIndex.value !== index
        ) {
          completion();
          return;
        }
        navigationDeletePreviewTimes.remember(
          expectedBookId,
          input,
          deletion.batch.updatedAt,
          previewRequest
        );
        completion(impact);
      } catch (error: unknown) {
        if (isDisposed()) return;
        uiMessage.warning(
          formatError(
            error,
            t("delete.couldNotCheckTheImpactOfDeleting", {
              title: input.title
            })
          )
        );
        completion();
      }
    });
  }

  return {
    confirmDeleteLongTreeItem,
    confirmDeleteLongDraftSection,
    deleteLongNavigationStructure,
    deleteActiveLongNavigationStructure,
    previewActiveLongNavigationStructure
  };
}

export type LongStructureDelete = ReturnType<typeof createLongStructureDelete>;
