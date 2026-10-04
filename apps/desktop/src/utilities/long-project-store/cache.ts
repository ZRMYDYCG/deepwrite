import {
  DOCUMENT_READ_CACHE_MAX_COST,
  DOCUMENT_READ_CACHE_MAX_ENTRIES,
  MAX_DOCUMENT_BYTES,
  MAX_LEDGER_RECORD_BYTES,
  UNICODE_PAGE_INDEX_STRIDE,
  type CachedPagedTextFile,
  type LoadedIndexedFile,
  type LoadedLongProject,
  type LoadedPagedIndexedFile,
  type SecureTextFile,
  type UnicodePageAnchor
} from "./types";
import { readSecureTextFile, secureTextFileMetadataMatches } from "./io";
import { requireIndexedFileDescriptor } from "./paths";
import type { LongProjectStoreContext } from "./store-context";

export function createCachedPagedTextFile(
  disk: SecureTextFile
): CachedPagedTextFile {
  const anchors: UnicodePageAnchor[] = [
    { characterOffset: 0, codeUnitOffset: 0 }
  ];
  let characterOffset = 0;
  let codeUnitOffset = 0;
  while (codeUnitOffset < disk.content.length) {
    const codePoint = disk.content.codePointAt(codeUnitOffset)!;
    codeUnitOffset += codePoint > 0xffff ? 2 : 1;
    characterOffset += 1;
    if (characterOffset % UNICODE_PAGE_INDEX_STRIDE === 0) {
      anchors.push({ characterOffset, codeUnitOffset });
    }
  }
  return {
    disk,
    totalCharacters: characterOffset,
    anchors,
    // Account for both UTF-8 bytes and the UTF-16 JS string. Sparse anchors
    // add only a small fixed overhead per 4K Unicode code points.
    cost: disk.bytes.byteLength + disk.content.length * 2 + anchors.length * 16
  };
}

export function codeUnitOffsetAtCharacter(
  paging: CachedPagedTextFile,
  targetCharacterOffset: number
): number {
  if (
    targetCharacterOffset < 0 ||
    targetCharacterOffset > paging.totalCharacters
  ) {
    throw new Error("长篇文档字符位置超过文件范围。");
  }
  let low = 0;
  let high = paging.anchors.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (paging.anchors[middle]!.characterOffset <= targetCharacterOffset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  const anchor = paging.anchors[low]!;
  let characterOffset = anchor.characterOffset;
  let codeUnitOffset = anchor.codeUnitOffset;
  while (characterOffset < targetCharacterOffset) {
    const codePoint = paging.disk.content.codePointAt(codeUnitOffset)!;
    codeUnitOffset += codePoint > 0xffff ? 2 : 1;
    characterOffset += 1;
  }
  return codeUnitOffset;
}

export function characterOffsetAtCodeUnit(
  paging: CachedPagedTextFile,
  targetCodeUnitOffset: number
): number {
  if (
    targetCodeUnitOffset < 0 ||
    targetCodeUnitOffset > paging.disk.content.length
  ) {
    throw new Error("长篇文档代码单元位置超过文件范围。");
  }
  let low = 0;
  let high = paging.anchors.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (paging.anchors[middle]!.codeUnitOffset <= targetCodeUnitOffset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  const anchor = paging.anchors[low]!;
  let characterOffset = anchor.characterOffset;
  let codeUnitOffset = anchor.codeUnitOffset;
  while (codeUnitOffset < targetCodeUnitOffset) {
    const codePoint = paging.disk.content.codePointAt(codeUnitOffset)!;
    codeUnitOffset += codePoint > 0xffff ? 2 : 1;
    characterOffset += 1;
  }
  if (codeUnitOffset !== targetCodeUnitOffset) {
    throw new Error("长篇文档字符位置落在代理对内部。");
  }
  return characterOffset;
}

export function sliceIndexedUnicodeCodePointRange(
  paging: CachedPagedTextFile,
  startCharacterOffset: number,
  endCharacterOffset: number
): string {
  if (endCharacterOffset < startCharacterOffset) {
    throw new Error("长篇文档字符范围无效。");
  }
  const start = codeUnitOffsetAtCharacter(paging, startCharacterOffset);
  const end = codeUnitOffsetAtCharacter(paging, endCharacterOffset);
  return paging.disk.content.slice(start, end);
}

export function sliceIndexedUnicodeCodePointPage(
  paging: CachedPagedTextFile,
  offset: number,
  limit: number
): {
  content: string;
  totalCharacters: number;
  nextOffset: number | null;
} {
  const pageEnd = Math.min(paging.totalCharacters, offset + limit);
  return {
    content: sliceIndexedUnicodeCodePointRange(paging, offset, pageEnd),
    totalCharacters: paging.totalCharacters,
    nextOffset: pageEnd < paging.totalCharacters ? pageEnd : null
  };
}

export function countUnicodeCodePoints(value: string): number {
  let count = 0;
  for (const _character of value) count += 1;
  return count;
}

export async function loadIndexedFile(
  loaded: LoadedLongProject,
  fileId: string
): Promise<LoadedIndexedFile> {
  const descriptor = requireIndexedFileDescriptor(loaded, fileId);
  if (descriptor.disk) {
    return descriptor as LoadedIndexedFile;
  }
  const disk = await readSecureTextFile(
    loaded.projectDirectory,
    descriptor.reference.path,
    descriptor.kind === "json" ? MAX_LEDGER_RECORD_BYTES : MAX_DOCUMENT_BYTES
  );
  descriptor.reference.updatedAt = disk.updatedAt;
  descriptor.disk = disk;
  return descriptor as LoadedIndexedFile;
}

export async function loadPagedIndexedFile(
  ctx: LongProjectStoreContext,
  loaded: LoadedLongProject,
  fileId: string
): Promise<LoadedPagedIndexedFile> {
  const descriptor = requireIndexedFileDescriptor(loaded, fileId);
  const maxBytes =
    descriptor.kind === "json" ? MAX_LEDGER_RECORD_BYTES : MAX_DOCUMENT_BYTES;
  const cacheKey = `${loaded.projectDirectory}\u0000${descriptor.reference.path}`;
  let paging = ctx.documentReadCache.get(cacheKey);
  if (
    paging &&
    !(await secureTextFileMetadataMatches(
      loaded.projectDirectory,
      descriptor.reference.path,
      maxBytes,
      paging.disk
    ))
  ) {
    removeDocumentReadCacheEntry(ctx, cacheKey, paging);
    paging = undefined;
  }
  if (!paging) {
    const disk = await readSecureTextFile(
      loaded.projectDirectory,
      descriptor.reference.path,
      maxBytes
    );
    paging = createCachedPagedTextFile(disk);
    insertDocumentReadCacheEntry(ctx, cacheKey, paging);
  } else {
    // Refresh LRU insertion order without cloning the potentially large
    // text or byte buffer.
    ctx.documentReadCache.delete(cacheKey);
    ctx.documentReadCache.set(cacheKey, paging);
  }
  return {
    ...descriptor,
    reference: { ...descriptor.reference, updatedAt: paging.disk.updatedAt },
    disk: paging.disk,
    paging
  };
}

export function insertDocumentReadCacheEntry(
  ctx: LongProjectStoreContext,
  key: string,
  entry: CachedPagedTextFile
): void {
  const current = ctx.documentReadCache.get(key);
  if (current) removeDocumentReadCacheEntry(ctx, key, current);
  if (entry.cost > DOCUMENT_READ_CACHE_MAX_COST) return;
  ctx.documentReadCache.set(key, entry);
  ctx.documentReadCacheCost += entry.cost;
  while (
    ctx.documentReadCache.size > DOCUMENT_READ_CACHE_MAX_ENTRIES ||
    ctx.documentReadCacheCost > DOCUMENT_READ_CACHE_MAX_COST
  ) {
    const oldest = ctx.documentReadCache.entries().next().value as
      [string, CachedPagedTextFile] | undefined;
    if (!oldest) break;
    removeDocumentReadCacheEntry(ctx, oldest[0], oldest[1]);
  }
}

export function removeDocumentReadCacheEntry(
  ctx: LongProjectStoreContext,
  key: string,
  entry: CachedPagedTextFile
): void {
  if (ctx.documentReadCache.get(key) !== entry) return;
  ctx.documentReadCache.delete(key);
  ctx.documentReadCacheCost = Math.max(
    0,
    ctx.documentReadCacheCost - entry.cost
  );
}
