import { expect, test, vi } from "vitest";
import { MemoryDav, connect, device, item } from "./sync-test-support";

async function pair() {
  const dav = new MemoryDav();
  const pc = device(
    "pc",
    dav,
    Array.from({ length: 20 }, (_, i) => item(`正文 ${i}`, `book_${i}`))
  );
  const phone = device("phone", dav);
  const space = await connect(pc);
  await pc.service.sync([], true);
  await connect(phone, space);
  await phone.service.sync([], true);
  await pc.service.sync();
  await phone.service.sync();
  await pc.service.check();
  return { dav, pc, phone, space };
}

test("unchanged sync only reads device heads, with no content or commit transfers", async () => {
  const { dav, pc } = await pair();
  const get = vi.spyOn(dav, "get");
  const put = vi.spyOn(dav, "put");
  const result = await pc.service.sync([], false, "upload");
  expect(result.progress.completed).toBe(0);
  expect(get.mock.calls.map(([path]) => path)).toHaveLength(2);
  expect(get.mock.calls.every(([path]) => path.endsWith("/head.json"))).toBe(
    true
  );
  expect(put).not.toHaveBeenCalled();
});

test("pulling one edit downloads only its new pack, reusing baseline files", async () => {
  const { dav, pc, phone } = await pair();
  pc.workspace.set("book:book_0", item("电脑新正文", "book_0"));
  await pc.service.sync([], false, "upload");
  const get = vi.spyOn(dav, "get");
  const result = await phone.service.sync([], false, "download");
  expect(result.progress.title).toBe("已上传 0 项，已下载 1 项");
  expect(phone.workspace.get("book:book_0")?.files["draft.md"]).toBe(
    "电脑新正文"
  );
  expect(
    get.mock.calls.filter(([path]) => path.includes("/objects/"))
  ).toHaveLength(1);
});

test("upload ignores unrelated remote content, even when that pending download is damaged", async () => {
  const { dav, pc, phone } = await pair();
  pc.workspace.set("book:book_0", item("远端更新", "book_0"));
  await pc.service.sync([], false, "upload");
  const revision = pc.metadata()?.baselines["book:book_0"]?.revision;
  const pack = revision?.files?.["draft.md"]?.pack;
  const damaged = [...dav.files.keys()].find((path) =>
    path.endsWith(`/${pack}.json`)
  );
  expect(damaged).toBeDefined();
  dav.files.set(damaged ?? "", "damaged-test-content");
  phone.workspace.set("book:book_1", item("手机更新", "book_1"));
  const get = vi.spyOn(dav, "get");
  const result = await phone.service.sync([], false, "upload");
  expect(result.progress.title).toBe("已上传 1 项，已下载 0 项");
  expect(get.mock.calls.some(([path]) => path === damaged)).toBe(false);
  expect(
    result.items.find((entry) => entry.key === "book:book_0")?.remoteDirty
  ).toBe(true);
  const before = phone.metadata()?.baselines["book:book_0"];
  const pull = await phone.service.sync([], false, "download");
  expect(pull.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: "book:book_0", reason: "failed" })
    ])
  );
  expect(phone.metadata()?.baselines["book:book_0"]).toEqual(before);
});

test("first-sync preview reads the manifest without downloading any work", async () => {
  const { dav, space } = await pair();
  const newcomer = device("newcomer", dav);
  await connect(newcomer, space);
  const get = vi.spyOn(dav, "get");
  const result = await newcomer.service.sync();
  expect(result.issues[0]?.reason).toBe("first-sync");
  expect(result.items).toHaveLength(20);
  expect(
    get.mock.calls.filter(([path]) => path.includes("/objects/"))
  ).toHaveLength(0);
  expect(newcomer.workspace.size).toBe(0);
});

test("progress polling reuses status during a transfer and refreshes after completion", async () => {
  const { dav, pc } = await pair();
  await pc.service.status();
  pc.workspace.set("book:book_0", item("待上传正文", "book_0"));
  const list = vi.spyOn(pc.options.workspace, "list");
  let scans = -1;
  dav.beforePut = async () => {
    scans = list.mock.calls.length;
    for (let i = 0; i < 5; i++) await pc.service.status();
    expect(list).toHaveBeenCalledTimes(scans);
  };
  const result = await pc.service.sync([], false, "upload");
  expect(scans).toBe(1);
  expect(list).toHaveBeenCalledTimes(2);
  expect(result.items.find((entry) => entry.key === "book:book_0")?.dirty).toBe(
    false
  );
});

async function historyPair() {
  const dav = new MemoryDav();
  const pc = device("pc", dav, [
    item("正文 0", "book_0"),
    item("正文 1", "book_1")
  ]);
  const space = await connect(pc);
  await pc.service.sync([], true);
  const phone = device("phone", dav);
  await connect(phone, space);
  await phone.service.sync([], true);
  return { pc, phone };
}

test("history keeps one restorable version per work: the content before the latest change", async () => {
  const { pc, phone } = await historyPair();
  for (const [index, body] of [
    "电脑第二版",
    "电脑第三版",
    "电脑第四版"
  ].entries()) {
    pc.workspace.set("book:book_0", item(body, "book_0"));
    await pc.service.sync([], false, "upload");
    await phone.service.sync([], false, "download");
    const mine =
      phone
        .metadata()
        ?.history.filter((entry) => entry.key === "book:book_0") ?? [];
    expect(mine).toHaveLength(1);
    expect(mine[0]?.item?.files["draft.md"]).toBe(
      ["正文 0", "电脑第二版", "电脑第三版"][index]
    );
  }
  expect(phone.metadata()?.history).toHaveLength(2);
});

test("the previous version can be restored and synced again, and the replaced one is kept", async () => {
  const { pc, phone } = await historyPair();
  pc.workspace.set("book:book_0", item("电脑新正文", "book_0"));
  await pc.service.sync([], false, "upload");
  await phone.service.sync([], false, "download");
  const previous = (await phone.service.status()).history.find(
    (entry) => entry.key === "book:book_0"
  );
  expect(previous?.canRestore).toBe(true);
  await phone.service.restore(previous?.id ?? "");
  expect(phone.workspace.get("book:book_0")?.files["draft.md"]).toBe("正文 0");
  expect((await phone.service.sync([], false, "upload")).progress.phase).toBe(
    "complete"
  );
  await pc.service.sync([], false, "download");
  expect(pc.workspace.get("book:book_0")?.files["draft.md"]).toBe("正文 0");
  const kept =
    phone.metadata()?.history.filter((entry) => entry.key === "book:book_0") ??
    [];
  expect(kept).toHaveLength(1);
  expect(kept[0]?.item?.files["draft.md"]).toBe("电脑新正文");
});

test("history left by earlier versions is compacted on the next sync", async () => {
  const { phone } = await historyPair();
  const before = phone.metadata();
  if (!before) throw new Error("missing metadata");
  const base = before.baselines["book:book_0"];
  if (!base) throw new Error("missing baseline");
  await phone.options.metadata.write({
    ...before,
    history: [
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `legacy_${i}`,
        key: "book:book_0",
        title: "测试作品",
        at: "2026-09-08T01:00:00.000Z",
        description: "同步前的版本",
        item: item(`旧版本 ${i}`, "book_0")
      })),
      ...before.history
    ],
    ancestors: { "book:book_0": [base] }
  });
  await phone.service.sync([], false, "download");
  const after = phone.metadata();
  const mine = after?.history.filter((entry) => entry.key === "book:book_0");
  expect(mine).toHaveLength(1);
  expect(mine?.[0]?.id).toBe("legacy_0");
  expect(after?.ancestors).toEqual({});
});
