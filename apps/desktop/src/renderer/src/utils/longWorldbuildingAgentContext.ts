import { createScopedTranslator } from "../i18n";
import {
  LONG_WORLDBUILDING_FOCUS_MAX_CHARACTERS,
  LONG_WORLDBUILDING_DIRECTORY_MAX_CATEGORIES,
  LONG_WORLDBUILDING_DIRECTORY_MAX_ITEMS,
  LONG_WORLDBUILDING_OVERVIEW_FOCUS_MAX_CHARACTERS,
  type LongBookId,
  type LongFileId,
  type LongReadDocumentInput,
  type LongReadDocumentResult,
  type LongWorldbuildingCategory,
  type LongWorldbuildingDirectorySnapshot,
  type LongWorldbuildingFocusSnapshot
} from "@deepwrite/contracts";
import type { LongWorkspaceSelection } from "../types/longWorkspace";

const t = createScopedTranslator("workspace");

type ReadLongDocument = (
  input: LongReadDocumentInput
) => Promise<LongReadDocumentResult>;

export function buildLongWorldbuildingDirectorySnapshot(
  categories: readonly LongWorldbuildingCategory[]
): LongWorldbuildingDirectorySnapshot {
  const visibleCategories = [...categories]
    .sort((left, right) => left.order - right.order)
    .slice(0, LONG_WORLDBUILDING_DIRECTORY_MAX_CATEGORIES);
  let remainingItemCapacity = LONG_WORLDBUILDING_DIRECTORY_MAX_ITEMS;
  return {
    categories: visibleCategories.map((category) => {
      if (category.format === "text") {
        return {
          categoryId: category.id,
          title: category.title,
          order: category.order,
          format: "text" as const
        };
      }
      const orderedItems = [...category.items].sort(
        (left, right) => left.order - right.order
      );
      const items = orderedItems
        .slice(0, remainingItemCapacity)
        .map((item) => ({
          itemId: item.id,
          title: item.title,
          order: item.order
        }));
      remainingItemCapacity -= items.length;
      return {
        categoryId: category.id,
        title: category.title,
        order: category.order,
        format: "list" as const,
        itemCount: orderedItems.length,
        items,
        omittedItemCount: orderedItems.length - items.length
      };
    }),
    omittedCategoryCount: categories.length - visibleCategories.length
  };
}

function snapshotText(
  page: LongReadDocumentResult,
  maximum: number
): LongWorldbuildingFocusSnapshot["currentStage"]["text"] {
  const characters = Array.from(page.content).slice(0, maximum);
  const content = characters.join("");
  return page.totalCharacters > characters.length
    ? {
        content,
        truncated: true,
        originalLength: page.totalCharacters
      }
    : { content };
}

async function readFocusText(
  readDocument: ReadLongDocument,
  bookId: LongBookId,
  fileId: LongFileId,
  maximum: number
): Promise<LongWorldbuildingFocusSnapshot["currentStage"]["text"]> {
  const page = await readDocument({
    bookId,
    fileId,
    offset: 0,
    maxCharacters: maximum
  });
  if (page.bookId !== bookId || page.file.id !== fileId || page.offset !== 0) {
    throw new Error(
      t(
        "longWorldbuildingAgentContext.theWorldbuildingStageResponseDoesNotMatchTheCurrent"
      )
    );
  }
  return snapshotText(page, maximum);
}

export async function buildLongWorldbuildingFocusSnapshot(input: {
  bookId: LongBookId;
  selection: LongWorkspaceSelection | null;
  activeFileId: LongFileId | null;
  readDocument: ReadLongDocument;
}): Promise<LongWorldbuildingFocusSnapshot | undefined> {
  const { bookId, selection, activeFileId, readDocument } = input;
  if (
    selection?.root !== "worldbuilding" ||
    !selection.worldbuildingFormat ||
    !activeFileId
  ) {
    return undefined;
  }

  const activeFile = selection.files.find(
    ({ file }) => file.id === activeFileId
  );
  if (!activeFile) return undefined;

  if (selection.worldbuildingFormat === "text") {
    return {
      categoryTitle: selection.title,
      format: "text",
      currentStage: {
        kind: "text",
        title: selection.title,
        text: await readFocusText(
          readDocument,
          bookId,
          activeFileId,
          LONG_WORLDBUILDING_FOCUS_MAX_CHARACTERS
        )
      }
    };
  }

  const overviewFile = selection.files.find(({ role }) => role === "overview");
  const activeItem = selection.worldbuildingItems?.find(
    ({ file }) => file.id === activeFileId
  );
  if (activeItem) {
    const stageMaximum =
      LONG_WORLDBUILDING_FOCUS_MAX_CHARACTERS -
      LONG_WORLDBUILDING_OVERVIEW_FOCUS_MAX_CHARACTERS;
    const [stageText, overviewText] = await Promise.all([
      readFocusText(readDocument, bookId, activeItem.file.id, stageMaximum),
      overviewFile
        ? readFocusText(
            readDocument,
            bookId,
            overviewFile.file.id,
            LONG_WORLDBUILDING_OVERVIEW_FOCUS_MAX_CHARACTERS
          )
        : Promise.resolve({ content: "" })
    ]);
    return {
      categoryTitle: selection.title,
      format: "list",
      currentStage: {
        kind: "item",
        title: activeItem.title,
        text: stageText
      },
      overview: overviewText
    };
  }

  if (overviewFile?.file.id !== activeFileId) return undefined;
  return {
    categoryTitle: selection.title,
    format: "list",
    currentStage: {
      kind: "overview",
      title: t("catalogWorkspace.overview"),
      text: await readFocusText(
        readDocument,
        bookId,
        overviewFile.file.id,
        LONG_WORLDBUILDING_FOCUS_MAX_CHARACTERS
      )
    }
  };
}
