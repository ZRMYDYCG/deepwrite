import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { join } from "node:path";
import {
  LONG_BOOK_ANALYSIS_MAX_DIRECTORY_BYTES,
  LONG_BOOK_ANALYSIS_MAX_SOURCE_CHAPTERS,
  LongBookAnalysisSavedSourceCatalogSchema,
  LongBookAnalysisSavedSourceIdSchema,
  LongBookAnalysisSavedSourceSummarySchema,
  LongBookAnalysisSourceSchema,
  type LongBookAnalysisSavedSourceCatalog,
  type LongBookAnalysisSavedSourceSummary,
  type LongBookAnalysisSource
} from "@deepwrite/contracts";

export const LONG_BOOK_ANALYSIS_SOURCE_DIRECTORY = "long-book-analysis-sources";

const METADATA_FILE = "metadata.json";
const SOURCE_FILE = "source.json";
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_SOURCE_SNAPSHOT_BYTES = LONG_BOOK_ANALYSIS_MAX_DIRECTORY_BYTES * 4;

interface DiskMetadata {
  version: 1;
  summary: LongBookAnalysisSavedSourceSummary;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function readRegularFile(
  path: string,
  maximumBytes: number
): Promise<string> {
  const stats = await lstat(path);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error("长篇拆书来源快照不是安全的普通文件。");
  }
  if (stats.size > maximumBytes) {
    throw new Error("长篇拆书来源快照超过安全读取上限。");
  }
  return readFile(path, "utf8");
}

function parseMetadata(raw: unknown): LongBookAnalysisSavedSourceSummary {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    !("version" in raw) ||
    raw.version !== 1 ||
    !("summary" in raw)
  ) {
    throw new Error("长篇拆书来源元数据格式无效。");
  }
  return LongBookAnalysisSavedSourceSummarySchema.parse(raw.summary);
}

function createSummary(
  source: LongBookAnalysisSource,
  importedAt: string
): LongBookAnalysisSavedSourceSummary {
  return LongBookAnalysisSavedSourceSummarySchema.parse({
    id: source.id,
    kind: source.kind,
    name: source.name,
    chapterCount: source.chapters.length,
    characterCount: source.chapters.reduce(
      (total, chapter) => total + chapter.charCount,
      0
    ),
    importedAt
  });
}

export class LongBookAnalysisSourceStore {
  readonly directory: string;

  constructor(workspaceDirectory: string) {
    this.directory = join(
      workspaceDirectory,
      LONG_BOOK_ANALYSIS_SOURCE_DIRECTORY
    );
  }

  private entryDirectory(sourceId: string): string {
    return join(
      this.directory,
      LongBookAnalysisSavedSourceIdSchema.parse(sourceId)
    );
  }

  private async ensureDirectory(): Promise<void> {
    try {
      const stats = await lstat(this.directory);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error("长篇拆书来源目录必须是普通文件夹，不能是符号链接。");
      }
      return;
    } catch (error: unknown) {
      if (!isNodeError(error, "ENOENT")) throw error;
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const stats = await lstat(this.directory);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error("无法安全创建长篇拆书来源目录。");
    }
  }

  async save(
    rawSource: LongBookAnalysisSource
  ): Promise<LongBookAnalysisSavedSourceSummary> {
    const source = LongBookAnalysisSourceSchema.parse(rawSource);
    LongBookAnalysisSavedSourceIdSchema.parse(source.id);
    await this.ensureDirectory();

    const summary = createSummary(source, new Date().toISOString());
    const target = this.entryDirectory(source.id);
    const temporary = join(
      this.directory,
      `.tmp-${source.id}-${process.pid}-${Date.now()}`
    );
    await mkdir(temporary, { mode: 0o700 });
    try {
      const metadata: DiskMetadata = { version: 1, summary };
      await Promise.all([
        writeFile(
          join(temporary, METADATA_FILE),
          `${JSON.stringify(metadata, null, 2)}\n`,
          { encoding: "utf8", mode: 0o600 }
        ),
        writeFile(join(temporary, SOURCE_FILE), `${JSON.stringify(source)}\n`, {
          encoding: "utf8",
          mode: 0o600
        })
      ]);
      await rename(temporary, target);
    } catch (error: unknown) {
      await rm(temporary, { recursive: true, force: true });
      throw error;
    }
    return summary;
  }

  async list(): Promise<LongBookAnalysisSavedSourceCatalog> {
    let entries;
    try {
      entries = await readdir(this.directory, { withFileTypes: true });
    } catch (error: unknown) {
      if (isNodeError(error, "ENOENT")) return { sources: [] };
      throw error;
    }

    const sources: LongBookAnalysisSavedSourceSummary[] = [];
    for (const entry of entries) {
      if (
        sources.length >= LONG_BOOK_ANALYSIS_MAX_SOURCE_CHAPTERS ||
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        !LongBookAnalysisSavedSourceIdSchema.safeParse(entry.name).success
      ) {
        continue;
      }
      try {
        const raw = JSON.parse(
          await readRegularFile(
            join(this.directory, entry.name, METADATA_FILE),
            MAX_METADATA_BYTES
          )
        ) as unknown;
        const summary = parseMetadata(raw);
        if (summary.id === entry.name) sources.push(summary);
      } catch {
        // One damaged snapshot must not hide the remaining imported sources.
      }
    }
    sources.sort((left, right) =>
      right.importedAt.localeCompare(left.importedAt)
    );
    return LongBookAnalysisSavedSourceCatalogSchema.parse({ sources });
  }

  async load(rawSourceId: string): Promise<LongBookAnalysisSource> {
    const sourceId = LongBookAnalysisSavedSourceIdSchema.parse(rawSourceId);
    const entryDirectory = this.entryDirectory(sourceId);
    let entryStats;
    try {
      entryStats = await lstat(entryDirectory);
    } catch (error: unknown) {
      if (isNodeError(error, "ENOENT")) {
        throw new Error("所选长篇拆书来源不存在，可能已从工作目录移除。");
      }
      throw error;
    }
    if (entryStats.isSymbolicLink() || !entryStats.isDirectory()) {
      throw new Error("所选长篇拆书来源目录不安全，无法读取。");
    }
    const source = LongBookAnalysisSourceSchema.parse(
      JSON.parse(
        await readRegularFile(
          join(entryDirectory, SOURCE_FILE),
          MAX_SOURCE_SNAPSHOT_BYTES
        )
      )
    );
    if (source.id !== sourceId) {
      throw new Error("长篇拆书来源快照与目录标识不一致。");
    }
    return source;
  }
}
