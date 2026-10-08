import { expect, test } from "vitest";
import { MemoryDav, connect, device, item } from "./sync-test-support";

const key = "book:book_example";

test("a lagging device's merge base survives compaction, and goes once every device has caught up", async () => {
  const dav = new MemoryDav();
  const pc = device("pc", dav, [item()]);
  const phone = device("phone", dav);
  const space = await connect(pc);
  await pc.service.sync([], true);
  await connect(phone, space);
  await phone.service.sync([], true);

  // The phone plans its upload from the first version, then stalls before publishing.
  phone.workspace.set(key, item("第一行\n第二行\n手机改\n"));
  let resume!: () => void;
  let stalled!: () => void;
  const reached = new Promise<void>((resolve) => (stalled = resolve));
  dav.beforePut = async () => {
    dav.beforePut = null;
    stalled();
    await new Promise<void>((resolve) => (resume = resolve));
  };
  const phoneSync = phone.service.sync();
  await reached;
  // Meanwhile the computer saves two more versions.
  for (const first of ["电脑二", "电脑三"]) {
    pc.workspace.set(key, item(`${first}\n第二行\n第三行\n`));
    await pc.service.sync();
  }
  expect(pc.metadata()?.ancestors[key]?.length).toBeGreaterThan(0);
  resume();
  expect((await phoneSync).issues).toEqual([]);

  // The phone's version is concurrent with the computer's baseline: only the first version is their common base.
  const merged = await pc.service.sync();
  expect(merged.issues).toEqual([]);
  expect(pc.workspace.get(key)?.files["draft.md"]).toBe(
    "电脑三\n第二行\n手机改\n"
  );

  await phone.service.sync();
  await pc.service.sync();
  expect(phone.workspace.get(key)).toEqual(pc.workspace.get(key));
  expect(pc.metadata()?.ancestors[key]).toBeUndefined();
});
