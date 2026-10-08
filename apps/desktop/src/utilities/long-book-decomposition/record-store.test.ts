import type { LongBookDecompositionJob } from "@deepwrite/contracts";
import { describe, expect, it, vi } from "vitest";
import type { ProjectTransactionFileOperation } from "../project-transaction/types";
import { validateOperations } from "../project-transaction/validation";
import {
  DecompositionRecordStore,
  decompositionRecordId
} from "./record-store";

const commit = vi.hoisted(() => vi.fn());

// Run the store as on Windows, where `join` yields backslash separators.
vi.mock("node:path", async (importOriginal) => {
  const { win32 } = await importOriginal<typeof import("node:path")>();
  return { ...win32, default: win32 };
});
vi.mock("../project-transaction", () => ({ commitProjectTransaction: commit }));

describe("DecompositionRecordStore", () => {
  it("writes records with portable transaction paths on Windows", async () => {
    const job = {
      id: "long_book_decomposition_fixture",
      outputVersion: 1,
      units: { "reading:chapter_1": { inputRevision: "rev_1" } }
    } as unknown as LongBookDecompositionJob;
    const store = new DecompositionRecordStore(
      () => "C:\\DeepWrite\\long-book-decomposition-jobs\\fixture"
    );

    const id = await store.save(job, "reading:chapter_1", {
      kind: "finish-card"
    });

    expect(id).toBe(decompositionRecordId(job, "reading:chapter_1"));
    const { operations } = commit.mock.calls[0]![0] as {
      operations: ProjectTransactionFileOperation[];
    };
    expect(operations.map(({ path }) => path)).toEqual([`records/${id}.json`]);
    expect(() => validateOperations(operations, 1024 * 1024)).not.toThrow();
  });
});
