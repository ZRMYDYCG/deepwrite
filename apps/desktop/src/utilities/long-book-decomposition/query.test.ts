import { rm } from "node:fs/promises";
import { afterEach, expect, it } from "vitest";
import { queryDecomposition } from "./query";
import { decompositionFixture } from "./test-support";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

it.each(["continuation", "materials"] as const)(
  "returns an empty registry before %s has saved its merge",
  async (mode) => {
    const fixture = await decompositionFixture(mode, 1);
    roots.push(fixture.root);
    const result = await queryDecomposition(
      fixture.job,
      fixture.root,
      fixture.service.reader,
      { kind: "registry" }
    );
    expect(JSON.parse(result.content)).toMatchObject({
      characters: [],
      terms: [],
      nameIndex: {},
      editedByUser: false
    });
    expect(result.nextCursor).toBeNull();
  }
);

it("still rejects a missing authoritative registry record after the merge is marked done", async () => {
  const fixture = await decompositionFixture("continuation", 1);
  roots.push(fixture.root);
  fixture.job.units["registry:merge"] = {
    ...fixture.job.units["chunk:1"]!,
    phase: "registry",
    status: "done",
    outputRefs: []
  };
  await expect(
    queryDecomposition(fixture.job, fixture.root, fixture.service.reader, {
      kind: "registry"
    })
  ).rejects.toThrow();
});
