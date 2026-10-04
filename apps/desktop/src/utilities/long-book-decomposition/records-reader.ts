import { join } from "node:path";
import {
  MaterialLibraryProjectManifestSchema,
  DecompositionReceiptSchema,
  type LongBookDecompositionJob,
  type DecompositionContentRef,
  type DecompositionRecord,
  type DecompositionReceipt
} from "@deepwrite/contracts";
import type { FolderCatalogStore } from "../folder-catalog-store";
import type { LongWorkspaceService } from "../long-workspace-service";
import { readNoFollowFile } from "../long-project-store/io";
import { recoverProjectTransaction } from "../project-transaction";
import { decompositionLongFiles } from "./record-files";
import { decompositionSha } from "./content-guard";
import { decompositionReceiptId } from "./identity";
import {
  decompositionRecordId,
  decompositionUnitIsRecordOnly,
  type DecompositionRecordStore
} from "./record-store";

export class DecompositionRecordsReader {
  constructor(
    readonly longs: LongWorkspaceService,
    readonly catalog: FolderCatalogStore,
    readonly records: DecompositionRecordStore
  ) {}
  private cache?: Map<string, Promise<unknown>>;
  async snapshot<T>(operation: () => Promise<T>): Promise<T> {
    if (this.cache) return operation();
    this.cache = new Map();
    try {
      return await operation();
    } finally {
      delete this.cache;
    }
  }
  private memo<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (!this.cache) return operation();
    if (!this.cache.has(key)) this.cache.set(key, operation());
    return this.cache.get(key)! as Promise<T>;
  }
  private long(bookId: string) {
    return this.memo(`long:${bookId}`, () => this.longs.catalog.open(bookId));
  }
  content(ref: DecompositionContentRef): Promise<string> {
    return this.memo(`content:${ref.projectId}:${ref.resourceId}`, () =>
      this.readContent(ref)
    );
  }
  private async readContent(ref: DecompositionContentRef): Promise<string> {
    if (ref.fileId) {
      const opened = await this.long(ref.projectId);
      const index = opened.book.workspaceIndex;
      const files = await this.memo(`files:${ref.projectId}`, async () =>
        decompositionLongFiles(index)
      );
      const file = files.get(ref.fileId);
      if (!file) throw new Error("真实长篇文档已移除。");
      return (
        await readNoFollowFile(
          join(opened.projectDirectory, file.path),
          32 * 1024 * 1024,
          "真实长篇文档",
          opened.projectDirectory
        )
      ).bytes.toString("utf8");
    }
    const root = await this.catalog.managedProjectDirectory(ref.projectId);
    await recoverProjectTransaction(root);
    const manifest = await this.memo(`manifest:${ref.projectId}`, async () =>
      MaterialLibraryProjectManifestSchema.parse(
        JSON.parse(
          (
            await readNoFollowFile(
              join(root, "deepwrite.json"),
              4 * 1024 * 1024,
              "素材清单",
              root
            )
          ).bytes.toString("utf8")
        )
      )
    );
    const entry = manifest.entries.find(({ id }) => id === ref.resourceId);
    if (!entry) throw new Error("真实素材条目已移除。");
    return (
      await readNoFollowFile(
        join(root, entry.path),
        32 * 1024 * 1024,
        "真实素材",
        root
      )
    ).bytes.toString("utf8");
  }
  /** The machine record a unit submitted, read from the task directory. */
  record(
    job: LongBookDecompositionJob,
    unitId: string
  ): Promise<DecompositionRecord> {
    if (!job.units[unitId]) throw new Error("未知单元。");
    return this.memo(
      `record:${job.id}:${decompositionRecordId(job, unitId)}`,
      () => this.records.record(job, unitId)
    );
  }
  async receipts(
    job: LongBookDecompositionJob,
    committedRefs?: Record<string, DecompositionContentRef[]>
  ): Promise<DecompositionReceipt[]> {
    const files: Array<{ root: string; path: string }> = [];
    if (job.target?.kind === "long") {
      const opened = await this.longs.catalog.open(job.target.bookId);
      files.push(
        ...(opened.book.workspaceIndex.writeReceipts ?? []).map(({ path }) => ({
          root: opened.projectDirectory,
          path
        }))
      );
    } else if (job.target?.kind === "material-group") {
      for (const libraryId of Object.values(job.target.libraryIds)) {
        const root = await this.catalog.managedProjectDirectory(libraryId);
        await recoverProjectTransaction(root);
        const manifest = MaterialLibraryProjectManifestSchema.parse(
          JSON.parse(
            (
              await readNoFollowFile(
                join(root, "deepwrite.json"),
                4 * 1024 * 1024,
                "素材清单",
                root
              )
            ).bytes.toString("utf8")
          )
        );
        files.push(
          ...(manifest.writeReceipts ?? []).map(({ path }) => ({ root, path }))
        );
      }
    }
    const receipts = new Map<string, DecompositionReceipt>();
    const ids = new Map<string, Set<string>>();
    // A unit whose only output is its record is saved once the record exists.
    const saved = await this.records.ids(job.id);
    for (const [unitId, unit] of Object.entries(job.units)) {
      if (
        !decompositionUnitIsRecordOnly(job, unitId) ||
        !saved.has(decompositionRecordId(job, unitId))
      )
        continue;
      const id = decompositionReceiptId(
        job.id,
        job.outputVersion,
        unitId,
        unit.inputRevision
      );
      receipts.set(unitId, {
        id,
        jobId: job.id,
        outputVersion: job.outputVersion,
        unitId,
        inputRevision: unit.inputRevision,
        refs: [],
        savedAt: unit.updatedAt
      });
      ids.set(unitId, new Set([id]));
    }
    for (const { root, path } of files) {
      const raw = (
        await readNoFollowFile(
          join(root, path),
          4 * 1024 * 1024,
          "目标内回执",
          root
        )
      ).bytes.toString("utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      const result = DecompositionReceiptSchema.safeParse(parsed);
      if (!result.success) continue;
      const receipt = result.data;
      if (
        receipt.jobId !== job.id ||
        receipt.outputVersion !== job.outputVersion ||
        job.units[receipt.unitId]?.inputRevision !== receipt.inputRevision
      )
        continue;
      const key = receipt.unitId;
      const existing = receipts.get(key);
      receipts.set(
        key,
        existing
          ? { ...existing, refs: [...existing.refs, ...receipt.refs] }
          : receipt
      );
      const savedIds = ids.get(key) ?? new Set<string>();
      savedIds.add(receipt.id);
      ids.set(key, savedIds);
    }
    return [...receipts.values()]
      .filter(
        (receipt) =>
          job.units[receipt.unitId]!.requiredReceiptIds?.every((id) =>
            ids.get(receipt.unitId)?.has(id)
          ) ?? true
      )
      .map((receipt) =>
        committedRefs?.[receipt.unitId]
          ? { ...receipt, refs: committedRefs[receipt.unitId]! }
          : receipt
      );
  }
  async validateRef(
    job: LongBookDecompositionJob,
    ref: DecompositionContentRef
  ): Promise<void> {
    if ((await this.currentHash(job, ref)) !== ref.sha256)
      throw new Error(
        `decomposition.conflict: 真实内容版本发生变化：${ref.resourceId}`
      );
  }
  async actualContents(job: LongBookDecompositionJob, unitId: string) {
    return Promise.all(
      job.units[unitId]!.outputRefs.map(async (ref) => {
        let content: unknown;
        if (ref.fileId || job.target?.kind === "material-group")
          content = await this.content(ref);
        else {
          const index = (await this.long(ref.projectId)).book.workspaceIndex;
          content = [
            ...index.characters,
            ...index.worldbuilding,
            ...index.plot.volumes,
            ...index.plot.arcs,
            ...index.plot.storyPlots,
            ...index.plot.foreshadowing
          ].find(({ id }) => id === ref.resourceId);
        }
        return { resourceId: ref.resourceId, content };
      })
    );
  }
  async currentHash(
    job: LongBookDecompositionJob,
    ref: DecompositionContentRef
  ): Promise<string> {
    if (ref.fileId || job.target?.kind === "material-group") {
      return decompositionSha(await this.content(ref));
    } else if (job.target?.kind === "long") {
      const index = (await this.long(ref.projectId)).book.workspaceIndex;
      const object = [
        ...index.characters,
        ...index.worldbuilding,
        ...index.plot.volumes,
        ...index.plot.arcs,
        ...index.plot.storyPlots,
        ...index.plot.foreshadowing
      ].find(({ id }) => id === ref.resourceId);
      if (!object)
        throw new Error(
          `decomposition.conflict: 真实对象已移除：${ref.resourceId}`
        );
      return decompositionSha(JSON.stringify(object));
    }
    throw new Error("目标不存在。");
  }
}
