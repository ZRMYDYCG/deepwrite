import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  LongBookDecompositionJobSchema,
  DecompositionSubmitInputSchema
} from "@deepwrite/contracts";
import { LongWorkspaceService } from "../long-workspace-service";
import { FolderCatalogStore } from "../folder-catalog-store";
import { DecompositionService } from "./service";
import { LongBookAnalysisSourceStore } from "../../extras/agents/sources/long-book-source-store";

const [root, jobId, phase, inputPath] = process.argv.slice(2) as [
  string,
  string,
  string,
  string
];
const userDataPath = join(root, "user-data");
const longs = new LongWorkspaceService({ userDataPath });
const catalog = new FolderCatalogStore({ userDataPath });
const service = new DecompositionService(root, longs, catalog);
async function checkpoint(): Promise<never> {
  process.send?.({ checkpoint: phase });
  return new Promise(() => {
    setInterval(() => {}, 1000);
  });
}
try {
  if (phase === "source-save" || phase === "source-confirm") {
    const job = await service.state.load(jobId);
    const sources = new LongBookAnalysisSourceStore(root);
    const source = await sources.load(job.source.sourceId);
    const saved = await sources.saveChapters({
      sourceId: source.id,
      baseRevision: source.revision!,
      chapters: source.chapters.map((chapter) => ({
        ...chapter,
        title: "已校对的标题",
        text: "新版本自写正文",
        charCount: 7
      }))
    });
    if (phase === "source-confirm") {
      const confirmation = await sources.confirm({
        sourceId: saved.id,
        sourceRevision: saved.revision!,
        fingerprint: saved.fingerprint!,
        range: job.source.range
      });
      process.send?.({ confirmation });
    }
    await checkpoint();
  } else if (phase === "prepare-target") {
    const create = catalog.createLibrary.bind(catalog);
    catalog.createLibrary = async (input) => {
      await create(input);
      return checkpoint();
    };
    const job = LongBookDecompositionJobSchema.parse(
      JSON.parse(await readFile(inputPath, "utf8"))
    );
    await service.create(job, {
      book: join(root, "books"),
      materials: join(root, "materials"),
      groups: join(root, "groups")
    });
  } else if (phase === "ledger") {
    const commit = longs.store.commitChapter.bind(longs.store);
    longs.store.commitChapter = async (...args) => {
      await commit(...args);
      return checkpoint();
    };
    await service.advance(await service.state.load(jobId));
  } else {
    const input = DecompositionSubmitInputSchema.parse(
      JSON.parse(await readFile(inputPath, "utf8"))
    );
    if (phase === "cross-library") {
      const write = catalog.writeManagedEntry.bind(catalog);
      catalog.writeManagedEntry = async (value) => {
        await write(value);
        return checkpoint();
      };
    } else {
      const save = service.state.save.bind(service.state);
      service.state.save = async (job) => {
        if (job.units[input.unitId]?.status === "done") return checkpoint();
        return save(job);
      };
    }
    await service.submit(input);
  }
  throw new Error("故障注入未到达指定检查点。");
} catch (error) {
  process.send?.({
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
}
