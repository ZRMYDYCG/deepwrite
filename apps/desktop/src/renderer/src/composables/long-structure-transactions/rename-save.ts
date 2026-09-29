import { formatError } from "../../i18n/errors";
import { createScopedTranslator } from "../../i18n";
import type {
  LongArcId,
  LongCharacterId,
  LongWorkspaceOperationBatch
} from "@deepwrite/contracts";
import type { LongStructureLease } from "./lease";
import type { LongStructureSync } from "./sync";
import { booleanMutationCompletion } from "./types";

const t = createScopedTranslator("workspace");

export function createLongStructureRenameSave(
  host: LongStructureLease,
  sync: LongStructureSync,
  loadLongStructureMutationModule: () => Promise<
    typeof import("../../types/longStructureMutations")
  >
) {
  const {
    uiMessage,
    state,
    isDisposed,
    assertCurrentLongStructureMutationTarget,
    withMutation
  } = host;
  const { executeLongStructureMutation } = sync;
  const { activeBookId: activeLongBookId } = state;

  async function renameLongCharacter(
    input: { characterId: LongCharacterId; name: string },
    completion: (succeeded: boolean) => void
  ): Promise<void> {
    await withMutation(
      activeLongBookId.value,
      (message) => {
        uiMessage.warning(message);
        completion(false);
      },
      async (lease) => {
        const index = lease.target.index;
        const character = index.characters.find(
          ({ id }) => id === input.characterId
        );
        const name = input.name.trim();
        if (!character) {
          uiMessage.warning(
            t(
              "navigationDeleteBatch.thisCharacterNoLongerExistsRefreshAndTryAgain"
            )
          );
          completion(false);
          return;
        }
        if (!name) {
          uiMessage.warning(
            t("longEditorStructureSelection.theCharacterNameCannotBeEmpty")
          );
          completion(false);
          return;
        }
        if (name === character.name) {
          completion(true);
          return;
        }
        let batch: LongWorkspaceOperationBatch;
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          batch = createLongStructureMutationBuilder(index).updateCharacter(
            character.id,
            { name }
          );
        } catch (error: unknown) {
          if (isDisposed()) return;
          uiMessage.warning(
            formatError(error, t("renameSave.couldNotChangeTheCharacterSName"))
          );
          completion(false);
          return;
        }
        await executeLongStructureMutation(
          lease,
          batch,
          booleanMutationCompletion(completion),
          {
            successMessage: t("renameSave.characterRenamedTo", {
              name: name
            })
          },
          index
        );
      }
    );
  }

  async function renameLongStructureTitle(
    input: {
      kind: "worldbuilding" | "volume" | "plotPoint" | "chapterCard";
      id: string;
      title: string;
    },
    completion: (succeeded: boolean) => void
  ): Promise<void> {
    await withMutation(
      activeLongBookId.value,
      (message) => {
        uiMessage.warning(message);
        completion(false);
      },
      async (lease) => {
        const index = lease.target.index;
        const title = input.title.trim();
        if (!title) {
          uiMessage.warning(t("renameSave.theTitleCannotBeEmpty"));
          completion(false);
          return;
        }
        let batch: LongWorkspaceOperationBatch | undefined;
        let currentTitle: string | undefined;
        let structureLabel = t("renameSave.structureItem");
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          const builder = createLongStructureMutationBuilder(index);
          switch (input.kind) {
            case "worldbuilding": {
              const category = index.worldbuilding.find(
                ({ id }) => id === input.id
              );
              currentTitle = category?.title;
              structureLabel = t(
                "longImpactConfirmation.worldbuildingCategory"
              );
              if (category)
                batch = builder.updateWorldbuilding(category.id, { title });
              break;
            }
            case "volume": {
              const volume = index.plot.volumes.find(
                ({ id }) => id === input.id
              );
              currentTitle = volume?.title;
              structureLabel = t("longImpactConfirmation.volume");
              if (volume) batch = builder.updateVolume(volume.id, { title });
              break;
            }
            case "plotPoint": {
              const plotPoint = index.plot.arcs.find(
                ({ id }) => id === input.id
              );
              currentTitle = plotPoint?.title;
              structureLabel = t("longImpactConfirmation.plotPoint");
              if (plotPoint) batch = builder.updateArc(plotPoint.id, { title });
              break;
            }
            case "chapterCard": {
              const chapter = index.plot.chapterCards.find(
                ({ id }) => id === input.id
              );
              currentTitle = chapter?.title;
              structureLabel = t("longImpactConfirmation.chapterCard");
              if (chapter) batch = builder.updateChapter(chapter.id, { title });
              break;
            }
          }
        } catch (error: unknown) {
          if (isDisposed()) return;
          uiMessage.warning(
            formatError(error, t("renameSave.couldNotChangeTheTitle"))
          );
          completion(false);
          return;
        }
        if (currentTitle === undefined || !batch) {
          uiMessage.warning(
            t("renameSave.thisNoLongerExistsRefreshAndTryAgain", {
              structureLabel: structureLabel
            })
          );
          completion(false);
          return;
        }
        if (title === currentTitle) {
          completion(true);
          return;
        }
        await executeLongStructureMutation(
          lease,
          batch,
          booleanMutationCompletion(completion),
          {
            successMessage: t("renameSave.renamedTheTo", {
              structureLabel: structureLabel,
              title: title
            })
          },
          index
        );
      }
    );
  }

  async function saveLongVolumeOutline(
    input: { volumeId: string; outline: string },
    completion: (succeeded: boolean) => void
  ): Promise<void> {
    await withMutation(
      activeLongBookId.value,
      (message) => {
        uiMessage.warning(message);
        completion(false);
      },
      async (lease) => {
        const index = lease.target.index;
        const volume = index.plot.volumes.find(
          ({ id }) => id === input.volumeId
        );
        if (!volume) {
          uiMessage.warning(
            t(
              "navigationDeleteBatch.thisVolumeNoLongerExistsRefreshAndTryAgain"
            )
          );
          completion(false);
          return;
        }
        let batch: LongWorkspaceOperationBatch;
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          batch = createLongStructureMutationBuilder(index).updateVolume(
            volume.id,
            {
              summary: input.outline
            }
          );
        } catch (error: unknown) {
          if (isDisposed()) return;
          uiMessage.warning(
            formatError(error, t("renameSave.couldNotSaveTheVolumeOutline"))
          );
          completion(false);
          return;
        }
        await executeLongStructureMutation(
          lease,
          batch,
          booleanMutationCompletion(completion),
          {
            saveEditor: false,
            successMessage: t("renameSave.savedTheOutlineFor", {
              title: volume.title
            })
          },
          index
        );
      }
    );
  }

  async function saveLongPlotPointContent(
    input: { plotPointId: LongArcId; field: "summary"; content: string },
    completion: (succeeded: boolean) => void
  ): Promise<void> {
    await withMutation(
      activeLongBookId.value,
      (message) => {
        uiMessage.warning(message);
        completion(false);
      },
      async (lease) => {
        const index = lease.target.index;
        const plotPoint = index.plot.arcs.find(
          ({ id }) => id === input.plotPointId
        );
        if (!plotPoint) {
          uiMessage.warning(
            t("navigationDeleteBatch.thisPlotPointNoLongerExistsRefreshAndTry")
          );
          completion(false);
          return;
        }
        let batch: LongWorkspaceOperationBatch;
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          batch = createLongStructureMutationBuilder(index).updateArc(
            plotPoint.id,
            {
              summary: input.content
            }
          );
        } catch (error: unknown) {
          if (isDisposed()) return;
          uiMessage.warning(
            formatError(error, t("renameSave.couldNotSaveThePlotPointContent"))
          );
          completion(false);
          return;
        }
        await executeLongStructureMutation(
          lease,
          batch,
          booleanMutationCompletion(completion),
          {
            saveEditor: false,
            successMessage: t("renameSave.savedTheSummaryFor", {
              title: plotPoint.title
            })
          },
          index
        );
      }
    );
  }

  return {
    renameLongCharacter,
    renameLongStructureTitle,
    saveLongVolumeOutline,
    saveLongPlotPointContent
  };
}

export type LongStructureRenameSave = ReturnType<
  typeof createLongStructureRenameSave
>;
