import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  LongBookDecompositionJobSchema,
  DecompositionIdSchema,
  DecompositionTargetPreparationSchema,
  DecompositionCompletionSchema,
  type LongBookDecompositionJob,
  type DecompositionContentRef
} from "@deepwrite/contracts";
import {
  commitProjectTransaction,
  recoverProjectTransaction
} from "../project-transaction";
import {
  ensureSecureDirectory,
  readNoFollowFile,
  secureDirectory
} from "../long-project-store/io";

// Completion journals may hold the refs from job.json in older versions.
// Reads, writes and transaction recovery must accept the same file size.
const MAX_JOB_FILE_BYTES = 32 * 1024 * 1024;

export interface TargetPreparation {
  operationId: string;
  bookId: string;
  groupId: string;
  libraryIds: Record<
    "character" | "plot" | "draft" | "other" | "gimmick",
    string
  >;
  paths: { book: string; materials: string; groups: string };
  steps: string[];
}
export interface DecompositionCompletion {
  commitId?: string | undefined;
  finalized?: boolean | undefined;
  postCommitRefs?: Record<string, DecompositionContentRef[]> | undefined;
}
export class DecompositionJobStateStore {
  readonly root: string;
  constructor(readonly workspaceDirectory: string) {
    this.root = join(workspaceDirectory, "long-book-decomposition-jobs");
  }
  directory(id: string) {
    return join(this.root, DecompositionIdSchema.parse(id));
  }
  async initialize(
    job: LongBookDecompositionJob,
    preparation: TargetPreparation
  ) {
    await ensureSecureDirectory(this.root, "整书拆解任务目录");
    const root = await ensureSecureDirectory(
      this.directory(job.id),
      "整书拆解任务"
    );
    await commitProjectTransaction({
      projectRoot: root,
      maxFileBytes: MAX_JOB_FILE_BYTES,
      operations: [
        {
          path: "job.json",
          content: JSON.stringify(LongBookDecompositionJobSchema.parse(job)),
          expectedSha256: null
        },
        {
          path: "target-preparation.json",
          content: JSON.stringify(
            DecompositionTargetPreparationSchema.parse(preparation)
          ),
          expectedSha256: null
        }
      ]
    });
  }
  async load(id: string): Promise<LongBookDecompositionJob> {
    const root = await secureDirectory(this.directory(id), "拆解任务");
    await recoverProjectTransaction(root, MAX_JOB_FILE_BYTES);
    const { bytes } = await readNoFollowFile(
      join(root, "job.json"),
      MAX_JOB_FILE_BYTES,
      "任务状态",
      root
    );
    const job = LongBookDecompositionJobSchema.parse(
      JSON.parse(bytes.toString("utf8"))
    );
    if (job.id !== id) throw new Error("任务标识不一致。");
    return job;
  }
  async save(job: LongBookDecompositionJob) {
    job.updatedAt = new Date().toISOString();
    await commitProjectTransaction({
      projectRoot: this.directory(job.id),
      maxFileBytes: MAX_JOB_FILE_BYTES,
      operations: [
        {
          path: "job.json",
          content: JSON.stringify(LongBookDecompositionJobSchema.parse(job))
        }
      ]
    });
  }
  async readPreparation(id: string): Promise<TargetPreparation> {
    const root = await secureDirectory(this.directory(id), "拆解任务");
    const { bytes } = await readNoFollowFile(
      join(root, "target-preparation.json"),
      1024 * 1024,
      "目标准备日志",
      root
    );
    return DecompositionTargetPreparationSchema.parse(
      JSON.parse(bytes.toString("utf8"))
    );
  }
  async savePreparation(id: string, preparation: TargetPreparation) {
    await commitProjectTransaction({
      projectRoot: this.directory(id),
      operations: [
        {
          path: "target-preparation.json",
          content: JSON.stringify(
            DecompositionTargetPreparationSchema.parse(preparation)
          )
        }
      ]
    });
  }
  async completion(id: string): Promise<DecompositionCompletion> {
    try {
      const root = await secureDirectory(this.directory(id), "拆解任务");
      const { bytes } = await readNoFollowFile(
        join(root, "completion.json"),
        MAX_JOB_FILE_BYTES,
        "完成记录",
        root
      );
      return DecompositionCompletionSchema.parse(
        JSON.parse(bytes.toString("utf8"))
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }
  async saveCompletion(id: string, value: DecompositionCompletion) {
    await commitProjectTransaction({
      projectRoot: this.directory(id),
      maxFileBytes: MAX_JOB_FILE_BYTES,
      operations: [
        {
          path: "completion.json",
          content: JSON.stringify(DecompositionCompletionSchema.parse(value))
        }
      ]
    });
  }
  async list(): Promise<LongBookDecompositionJob[]> {
    await ensureSecureDirectory(this.root, "整书拆解任务目录");
    const result: LongBookDecompositionJob[] = [];
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        !DecompositionIdSchema.safeParse(entry.name).success
      )
        continue;
      result.push(await this.load(entry.name));
    }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async remove(id: string) {
    await secureDirectory(this.directory(id), "拆解任务");
    await rm(this.directory(id), { recursive: true });
  }
}
