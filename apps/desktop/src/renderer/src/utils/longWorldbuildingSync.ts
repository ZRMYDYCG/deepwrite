import { createScopedTranslator } from "../i18n";
import {
  LongWorkspaceOperationBatchSchema,
  createEmptyLongMarkdownFileReference,
  longWorldbuildingContentPath,
  longWorldbuildingFileId,
  longWorldbuildingItemContentPath,
  longWorldbuildingItemFileId,
  longWorldbuildingOverviewContentPath,
  longWorldbuildingOverviewFileId,
  type LongDocumentWriteProposal,
  type LongFileId,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceOperation,
  type LongWorkspaceOperationBatch,
  type LongWorldbuildingCategory
} from "@deepwrite/contracts";
import { createId as createSharedId } from "@deepwrite/shared";
import { isLongMigrationEvidenceCategoryId } from "../types/longWorkspace";
import { longWorldbuildingFiles } from "./longWorldbuildingFiles";

const t = createScopedTranslator("workspace.longWorldbuildingSync");

export interface LongWorldbuildingSyncBookOption {
  id: string;
  title: string;
  categoryCount: number;
}

export interface LongWorldbuildingContentByFileId {
  readonly [fileId: string]: string;
}

export interface BuildLongWorldbuildingSyncBatchInput {
  target: LongWorkspaceIndexSnapshot;
  source: LongWorkspaceIndexSnapshot;
  contents: LongWorldbuildingContentByFileId;
  updatedAt?: string;
  createId?: (prefix: string) => string;
}

export interface LongWorldbuildingSyncBatchPlan {
  batch: LongWorkspaceOperationBatch;
  createdCategoryCount: number;
  deletedCategoryCount: number;
  writtenFileCount: number;
}

type ReadLongDocumentPage = (input: {
  bookId: string;
  fileId: LongFileId;
  offset: number;
  maxCharacters: number;
}) => Promise<{
  bookId: string;
  file: { id: LongFileId };
  offset: number;
  content: string;
  nextOffset: number | null;
}>;

/**
 * Syncable categories exclude migration-evidence rows that must stay on the
 * target book and are never imported from another long-form project.
 */
export function filterSyncableWorldbuildingCategories(
  categories: readonly LongWorldbuildingCategory[]
): LongWorldbuildingCategory[] {
  return [...categories]
    .filter((category) => !isLongMigrationEvidenceCategoryId(category.id))
    .sort((left, right) => left.order - right.order);
}

export function filterPreservedWorldbuildingCategoryIds(
  categories: readonly LongWorldbuildingCategory[]
): string[] {
  return [...categories]
    .filter((category) => isLongMigrationEvidenceCategoryId(category.id))
    .sort((left, right) => left.order - right.order)
    .map(({ id }) => id);
}

export async function readLongDocumentFullContent(
  readDocument: ReadLongDocumentPage,
  bookId: string,
  fileId: LongFileId
): Promise<string> {
  let offset = 0;
  const chunks: string[] = [];
  while (true) {
    const page = await readDocument({
      bookId,
      fileId,
      offset,
      maxCharacters: 262_144
    });
    if (
      page.bookId !== bookId ||
      page.file.id !== fileId ||
      page.offset !== offset
    ) {
      throw new Error(
        t("theWorldbuildingContentResponseDoesNotMatchTheRequest")
      );
    }
    chunks.push(page.content);
    if (page.nextOffset === null) {
      return chunks.join("");
    }
    if (page.nextOffset <= offset) {
      throw new Error(t("invalidPaginationCursorForWorldbuildingContent"));
    }
    offset = page.nextOffset;
  }
}

export async function loadSourceWorldbuildingContents(
  readDocument: ReadLongDocumentPage,
  bookId: string,
  categories: readonly LongWorldbuildingCategory[]
): Promise<LongWorldbuildingContentByFileId> {
  const contents: Record<string, string> = {};
  for (const file of longWorldbuildingFiles(categories)) {
    contents[file.id] = await readLongDocumentFullContent(
      readDocument,
      bookId,
      file.id
    );
  }
  return contents;
}

function proposalIdForFile(fileId: string): string {
  return `proposal_sync_${fileId.replace(/[^A-Za-z0-9._:-]/gu, "_")}`;
}

async function cloneCategoryForSync(
  category: LongWorldbuildingCategory,
  order: number,
  updatedAt: string,
  contents: LongWorldbuildingContentByFileId,
  createId: (prefix: string) => string
): Promise<{
  category: LongWorldbuildingCategory;
  writes: LongDocumentWriteProposal[];
}> {
  const writes: LongDocumentWriteProposal[] = [];
  const pushWrite = async (
    fileId: LongFileId,
    sourceFileId: LongFileId
  ): Promise<void> => {
    const content = contents[sourceFileId] ?? "";
    if (!content) return;
    writes.push({
      proposalId: proposalIdForFile(fileId),
      fileId,
      mode: "create",
      updatedAt,
      content,
      reason: t("syncWorldbuildingContentFromAnotherNovel")
    });
  };

  if (category.format === "text") {
    const id = createId("world");
    const file = createEmptyLongMarkdownFileReference(
      longWorldbuildingFileId(id),
      longWorldbuildingContentPath(id),
      updatedAt
    );
    await pushWrite(file.id, category.file.id);
    return {
      category: {
        id,
        title: category.title,
        order,
        format: "text",
        contentAuthority: "markdown",
        file
      },
      writes
    };
  }

  const id = createId("world");
  const overview = createEmptyLongMarkdownFileReference(
    longWorldbuildingOverviewFileId(id),
    longWorldbuildingOverviewContentPath(id),
    updatedAt
  );
  if (category.overview) {
    await pushWrite(overview.id, category.overview.id);
  }
  const items = [];
  for (const [itemIndex, item] of category.items
    .slice()
    .sort((left, right) => left.order - right.order)
    .entries()) {
    const itemId = createId("worlditem");
    const file = createEmptyLongMarkdownFileReference(
      longWorldbuildingItemFileId(itemId),
      longWorldbuildingItemContentPath(id, itemId),
      updatedAt
    );
    await pushWrite(file.id, item.file.id);
    items.push({
      id: itemId,
      title: item.title,
      order: itemIndex + 1,
      file
    });
  }
  return {
    category: {
      id,
      title: category.title,
      order,
      format: "list",
      contentAuthority: "files",
      overview,
      items
    },
    writes
  };
}

/**
 * Builds a single replace batch: delete editable target categories, recreate
 * source structure with fresh stable ids, and seed non-empty Markdown bodies.
 * Migration-evidence categories on the target are preserved.
 */
export async function buildLongWorldbuildingSyncBatch(
  input: BuildLongWorldbuildingSyncBatchInput
): Promise<LongWorldbuildingSyncBatchPlan> {
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const createId = input.createId ?? createSharedId;
  const sourceCategories = filterSyncableWorldbuildingCategories(
    input.source.worldbuilding
  );
  if (sourceCategories.length === 0) {
    throw new Error(t("theSelectedNovelHasNoWorldbuildingCategoriesToSync"));
  }

  const deletable = filterSyncableWorldbuildingCategories(
    input.target.worldbuilding
  );
  const preservedIds = filterPreservedWorldbuildingCategoryIds(
    input.target.worldbuilding
  );
  const operations: LongWorkspaceOperation[] = deletable.map((category) => ({
    type: "worldbuilding.delete",
    id: category.id
  }));
  const documentWrites: LongDocumentWriteProposal[] = [];
  const createdIds: string[] = [];

  for (const [index, sourceCategory] of sourceCategories.entries()) {
    const cloned = await cloneCategoryForSync(
      sourceCategory,
      index + 1,
      updatedAt,
      input.contents,
      createId
    );
    operations.push({
      type: "worldbuilding.create",
      category: cloned.category
    });
    createdIds.push(cloned.category.id);
    documentWrites.push(...cloned.writes);
  }

  const orderedIds = [...createdIds, ...preservedIds];
  if (orderedIds.length > 1) {
    operations.push({
      type: "worldbuilding.reorder",
      orderedIds
    });
  }

  const batch = LongWorkspaceOperationBatchSchema.parse({
    updatedAt,
    operations,
    documentWrites
  });

  return {
    batch,
    createdCategoryCount: createdIds.length,
    deletedCategoryCount: deletable.length,
    writtenFileCount: documentWrites.length
  };
}
