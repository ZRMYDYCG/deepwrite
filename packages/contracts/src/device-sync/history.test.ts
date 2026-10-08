import { describe, expect, it } from "vitest";
import { compactSyncHistory, compactSyncMetadata } from "./history";
import type { SyncItem, SyncMetadata } from "./schemas";

const NOW = "2026-09-08T01:00:00.000Z";
const book = (body: string, id = "a"): SyncItem => ({
  kind: "book",
  id,
  title: "测试作品",
  files: { "deepwrite.json": '{"schemaVersion":4}', "draft.md": body }
});
const entry = (key: string, body: string | null, id = `${key}_${body}`) => ({
  id,
  key,
  title: key,
  at: NOW,
  description: id,
  item: body === null ? null : book(body, key.slice(5))
});
const currentOf = (body: string | null) => () =>
  body === null ? null : book(body, "x");

describe("compactSyncHistory", () => {
  it("keeps the newest version that differs from the current one and drops the rest", () => {
    const history = [
      entry("book:a", "现在", "copy-of-current"),
      entry("book:a", "上一版", "previous"),
      entry("book:a", "更早", "older")
    ];
    const kept = compactSyncHistory(history, () => book("现在", "a"));
    expect(kept.map((value) => value.id)).toEqual(["previous"]);
    expect(kept[0]?.item?.files["draft.md"]).toBe("上一版");
  });

  it("keeps the newest snapshot when none differs, so it becomes the previous version later", () => {
    const history = [
      entry("book:a", "现在", "copy-of-current"),
      entry("book:a", "现在", "older-copy")
    ];
    expect(
      compactSyncHistory(history, currentOf("现在")).map((value) => value.id)
    ).toEqual(["copy-of-current"]);
    expect(
      compactSyncHistory(history, currentOf("已修改")).map((value) => value.id)
    ).toEqual(["copy-of-current"]);
  });

  it("keeps the content from before a deletion", () => {
    const history = [
      entry("book:a", null, "deleted-record"),
      entry("book:a", "删除前", "before-delete")
    ];
    expect(
      compactSyncHistory(history, currentOf(null)).map((value) => value.id)
    ).toEqual(["before-delete"]);
  });

  it("keeps the newest record of a work without snapshots, per work and in order", () => {
    const history = [
      entry("book:a", null, "a2"),
      entry("book:b", "上一版", "b-previous"),
      entry("book:a", null, "a1"),
      entry("book:b", "现在", "b-current")
    ];
    const kept = compactSyncHistory(history, (key) =>
      key === "book:b" ? book("现在", "b") : null
    );
    expect(kept.map((value) => value.id)).toEqual(["a2", "b-previous"]);
  });

  it("leaves an empty or already compact history unchanged", () => {
    expect(compactSyncHistory([], currentOf("x"))).toEqual([]);
    const history = [entry("book:a", "上一版", "only")];
    expect(compactSyncHistory(history, currentOf("现在"))).toEqual(history);
  });
});

describe("compactSyncMetadata", () => {
  const revision = (clock: number) => ({
    kind: "book" as const,
    id: "a",
    title: "测试作品",
    clock: { phone: clock },
    files: null
  });
  const record = (clock: number, body: string) => ({
    revision: revision(clock),
    item: book(body)
  });
  const metadata = (): SyncMetadata => ({
    schemaVersion: 1,
    deviceId: "phone",
    config: null,
    baselines: { "book:a": record(3, "第三版"), "book:b": record(1, "乙") },
    ancestors: {
      "book:a": [record(1, "第一版"), record(2, "第二版"), record(3, "第三版")],
      "book:b": [record(1, "乙")],
      "book:gone": [record(1, "已删")]
    },
    published: null,
    history: [
      entry("book:a", "第三版", "h3"),
      entry("book:a", "第二版", "h2"),
      entry("book:a", "第一版", "h1")
    ],
    lastSuccessAt: null,
    firstSyncConfirmed: true,
    lastCheckedAt: null,
    devices: [],
    pendingIssues: []
  });

  const otherDevice = (clock: Record<string, number> | null) => ({
    hash: "a".repeat(64),
    commit: {
      schemaVersion: 1 as const,
      spaceId: "space_test",
      deviceId: "pc",
      deviceName: "测试电脑",
      sequence: 1,
      createdAt: NOW,
      items: clock ? { "book:a": { ...revision(0), clock } } : {},
      receipts: {}
    }
  });
  const kept = (value: SyncMetadata) =>
    value.ancestors["book:a"]?.map((entry) => entry.revision.clock.phone);

  it("drops ancestors no merge can use when no other device holds an older version, and compacts history", () => {
    const compact = compactSyncMetadata(metadata());
    expect(Object.keys(compact.ancestors)).toEqual(["book:gone"]);
    expect(compact.history.map((value) => value.id)).toEqual(["h2"]);
    expect(compact.baselines).toEqual(metadata().baselines);
  });

  it("ignores this device's own previous commit when deciding what is settled", () => {
    const own = otherDevice({ phone: 1 });
    own.commit.deviceId = "phone";
    expect(kept(compactSyncMetadata({ ...metadata(), devices: [own] }))).toBe(
      undefined
    );
  });

  it("keeps every ancestor a lagging device may still merge from", () => {
    const lagging = { ...metadata(), devices: [otherDevice({ phone: 1 })] };
    expect(kept(compactSyncMetadata(lagging))).toEqual([1, 2]);
    // Once the other device holds version 2, version 1 can never be the newest common base again.
    const caughtUp = { ...metadata(), devices: [otherDevice({ phone: 2 })] };
    expect(kept(compactSyncMetadata(caughtUp))).toEqual([2]);
  });

  it("keeps the merge base of a concurrent version, and ignores a device that has not published the work", () => {
    // The other device edited after version 2, concurrently with version 3: version 2 is its merge base.
    const concurrent = {
      ...metadata(),
      devices: [otherDevice({ phone: 2, pc: 4 })]
    };
    expect(kept(compactSyncMetadata(concurrent))).toEqual([2]);
    const unpublished = { ...metadata(), devices: [otherDevice(null)] };
    expect(kept(compactSyncMetadata(unpublished))).toBe(undefined);
  });

  it("does not modify its input", () => {
    const original = Object.freeze(metadata());
    expect(() => compactSyncMetadata(original)).not.toThrow();
  });
});
