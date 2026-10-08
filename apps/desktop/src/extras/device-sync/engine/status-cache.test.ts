import { expect, test, vi } from "vitest";
import { MemoryDav, connect, device, item } from "./sync-test-support";

async function connected() {
  const dav = new MemoryDav();
  const pc = device("pc", dav, [
    item("正文一", "book_one"),
    item("正文二", "book_two")
  ]);
  await connect(pc);
  await pc.service.sync([], true);
  const scan = pc.options.workspace.list;
  const list = vi.spyOn(pc.options.workspace, "list");
  return { dav, pc, list, scan };
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
}

test("changing the scope does not scan the works again", async () => {
  const { pc, list } = await connected();
  const before = await pc.service.status();
  list.mockClear();

  const status = await pc.service.configure({
    ...before.config!,
    excludedKeys: ["book:book_two"]
  });

  expect(list).not.toHaveBeenCalled();
  expect(
    status.items.map(({ key, included, dirty }) => [key, included, dirty])
  ).toEqual(
    before.items.map(({ key, dirty }) => [key, key !== "book:book_two", dirty])
  );
  expect(pc.metadata()?.config?.excludedKeys).toEqual(["book:book_two"]);
  expect((await pc.service.status()).items).toEqual(status.items);
});

test("polls during a running sync reuse the last status with live progress", async () => {
  const { dav, pc, list } = await connected();
  await pc.service.status();
  pc.workspace.set("book:book_one", item("改过的正文", "book_one"));
  const paused = gate();
  const reached = gate();
  dav.beforePut = async () => {
    reached.open();
    await paused.opened;
  };
  list.mockClear();

  const syncing = pc.service.sync();
  await reached.opened;
  const scans = list.mock.calls.length;
  const polls = await Promise.all([pc.service.status(), pc.service.status()]);
  expect(list).toHaveBeenCalledTimes(scans);
  expect(polls[0]?.progress.phase).toBe("transferring");

  paused.open();
  dav.beforePut = null;
  const done = await syncing;
  expect(done.progress.phase).toBe("complete");
  expect(done.items.find((entry) => entry.key === "book:book_one")?.dirty).toBe(
    false
  );
});

test("concurrent status reads share one scan, and an older read cannot undo a newer scope", async () => {
  const { pc, list, scan } = await connected();
  const before = await pc.service.status();
  list.mockClear();
  const release = gate();
  list.mockImplementationOnce(async () => {
    await release.opened;
    return scan();
  });

  const reads = Promise.all([pc.service.status(), pc.service.status()]);
  await vi.waitFor(() => expect(list).toHaveBeenCalledOnce());
  await pc.service.configure({
    ...before.config!,
    excludedKeys: ["book:book_one"]
  });
  release.open();
  const [first, second] = await reads;
  expect(second).toBe(first);
  expect(list).toHaveBeenCalledOnce();

  // While the next operation holds the lock, polls see the configured scope, not the older read.
  const paused = gate();
  const reached = gate();
  pc.options.credentials.get = async () => {
    reached.open();
    await paused.opened;
    return "invalid-test-password";
  };
  const checking = pc.service.check();
  await reached.opened;
  const poll = await pc.service.status();
  expect(
    poll.items.find((entry) => entry.key === "book:book_one")?.included
  ).toBe(false);
  paused.open();
  await checking;
});
