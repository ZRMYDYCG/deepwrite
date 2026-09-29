import { createScopedTranslator } from "../../i18n";
import type {
  LongWorkspaceIndexSnapshot,
  LongWorkspaceOperationBatch
} from "@deepwrite/contracts";

const t = createScopedTranslator("workspace");

type MutationModule = typeof import("../../types/longStructureMutations");

export interface LongNavigationDeleteInput {
  kind: "character" | "volume" | "plotPoint" | "chapterCard";
  id: string;
  title: string;
}

export interface LongNavigationDeletion {
  batch: LongWorkspaceOperationBatch;
  label: string;
  title: string;
}

function longNavigationDeletePreviewKey(
  bookId: string,
  input: Pick<LongNavigationDeleteInput, "kind" | "id">
): string {
  return `${bookId}\0${input.kind}\0${input.id}`;
}

export function createLongNavigationDeletePreviewTimes() {
  const times = new Map<string, string>();
  const requests = new Map<string, number>();
  let nextRequest = 0;
  return {
    begin(
      bookId: string,
      input: Pick<LongNavigationDeleteInput, "kind" | "id">
    ): number {
      const request = ++nextRequest;
      requests.set(longNavigationDeletePreviewKey(bookId, input), request);
      return request;
    },
    remember(
      bookId: string,
      input: Pick<LongNavigationDeleteInput, "kind" | "id">,
      updatedAt: string,
      request: number
    ): void {
      const key = longNavigationDeletePreviewKey(bookId, input);
      if (requests.get(key) !== request) return;
      times.set(key, updatedAt);
    },
    timestampFor(
      bookId: string,
      input: Pick<LongNavigationDeleteInput, "kind" | "id">
    ): string | undefined {
      return times.get(longNavigationDeletePreviewKey(bookId, input));
    },
    clear(
      bookId: string,
      input: Pick<LongNavigationDeleteInput, "kind" | "id">
    ): void {
      const key = longNavigationDeletePreviewKey(bookId, input);
      times.delete(key);
      requests.delete(key);
    }
  };
}

export async function buildLongNavigationDeleteBatch(
  loadLongStructureMutationModule: () => Promise<MutationModule>,
  index: LongWorkspaceIndexSnapshot,
  input: LongNavigationDeleteInput,
  updatedAt?: string
): Promise<LongNavigationDeletion> {
  const { createLongStructureMutationBuilder } =
    await loadLongStructureMutationModule();
  const builder = createLongStructureMutationBuilder(
    index,
    updatedAt ? { now: () => updatedAt } : undefined
  );
  if (input.kind === "character") {
    const target = index.characters.find(({ id }) => id === input.id);
    if (!target)
      throw new Error(
        t("navigationDeleteBatch.thisCharacterNoLongerExistsRefreshAndTryAgain")
      );
    return {
      batch: builder.deleteCharacter(target.id),
      label: t("catalogWorkspace.characters"),
      title: target.name
    };
  }
  if (input.kind === "volume") {
    const target = index.plot.volumes.find(({ id }) => id === input.id);
    if (!target)
      throw new Error(
        t("navigationDeleteBatch.thisVolumeNoLongerExistsRefreshAndTryAgain")
      );
    return {
      batch: builder.deleteVolume(target.id),
      label: t("longImpactConfirmation.volume"),
      title: target.title
    };
  }
  if (input.kind === "plotPoint") {
    const target = index.plot.arcs.find(({ id }) => id === input.id);
    if (!target)
      throw new Error(
        t("navigationDeleteBatch.thisPlotPointNoLongerExistsRefreshAndTry")
      );
    return {
      batch: builder.deleteArc(target.id),
      label: t("longImpactConfirmation.plotPoint"),
      title: target.title
    };
  }
  const target = index.plot.chapterCards.find(({ id }) => id === input.id);
  if (!target)
    throw new Error(
      t("navigationDeleteBatch.thisChapterCardNoLongerExistsRefreshAndTry")
    );
  return {
    batch: builder.deleteChapter(target.id),
    label: t("longImpactConfirmation.chapterCard"),
    title: target.title
  };
}
