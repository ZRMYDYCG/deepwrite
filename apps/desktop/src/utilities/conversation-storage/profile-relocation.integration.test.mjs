import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { build } from "vite";
import { initializeStorageLocation } from "../../main/storage-bootstrap";
import { StorageLocationStore } from "../../main/storage-location-store";
import { loadConversationHistoryRecord } from "../../renderer/src/utils/conversationHistoryRecordLoader";
import { RendererStateStore } from "../renderer-state-store";
import { migrateStorageProfile } from "../storage-migration";
import { ConversationDatabase } from "./database";
import { migrateLegacyFile } from "./legacy-file-migration";
import {
  legacyFixtureDate,
  legacyFixtureKey as key,
  legacyProfilePaths,
  replayLegacyUnderNewPath,
  seedLegacyProfile,
  useOldMigrationPath
} from "./legacy-migration-fixture.test-support";

let directory;
const cleanup = [];
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "deepwrite-profile-worker-"));
  await build({
    configFile: false,
    logLevel: "silent",
    build: {
      ssr: join(dirname(fileURLToPath(import.meta.url)), "worker-entry.ts"),
      outDir: directory,
      emptyOutDir: false,
      rollupOptions: { output: { entryFileNames: "worker.mjs" } }
    },
    ssr: { noExternal: true }
  });
});
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "deepwrite-profile-reinstall-"))
  );
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const original = await seedLegacyProfile(join(root, "default"));
  const database = new ConversationDatabase(original.path);
  try {
    await migrateLegacyFile(database.database, original.source);
    database.commit({
      key,
      sessionId: "session",
      expectedRevision: 0,
      generation: 0,
      sequence: 1,
      batchId: "before-relocation",
      operations: [
        {
          type: "patchMessage",
          messageId: "first",
          changes: [{ op: "append", path: ["content"], text: " 已修改" }]
        },
        { type: "setMetadata", value: { draft: "已保存的新草稿" } }
      ]
    });
    useOldMigrationPath(database, original.source);
  } finally {
    database.close();
  }
  const target = legacyProfilePaths(join(root, "自定义用户数据"));
  const locations = new StorageLocationStore(original.profile);
  locations.schedule(target.profile, false);
  await migrateStorageProfile(locations.pending);
  locations.complete();
  return { original, target, locations };
}

function reopenApplication(defaultPath) {
  const paths = { userData: defaultPath, sessionData: defaultPath };
  // A newly installed binary starts with the same system default and must
  // rediscover the existing custom profile without another migration.
  const migration = vi.fn(() => {
    throw new Error("A retained profile must not be migrated again");
  });
  initializeStorageLocation(
    {
      getPath: () => defaultPath,
      setPath: (name, path) => {
        paths[name] = path;
      }
    },
    migration
  );
  expect(migration).not.toHaveBeenCalled();
  expect(paths.sessionData).toBe(paths.userData);
  const store = new RendererStateStore(paths.userData, {
    workerPath: join(directory, "worker.mjs")
  });
  cleanup.push(() => store.close());
  return store;
}

it("reopens a moved 1.6.303 profile through its retained setting and saves a new turn before another fresh startup", async () => {
  const { original, target, locations } = await fixture();
  vi.stubEnv("DEEPWRITE_MAIN_INSTANCE_ID", "fixture-updated-main");
  const first = reopenApplication(original.profile);
  const record = await loadConversationHistoryRecord(
    first.history,
    key,
    "session"
  );
  expect(record.messages.map((message) => message.content)).toEqual([
    "原始正文 已修改",
    "原始正文"
  ]);
  expect(record.draft).toBe("已保存的新草稿");
  const state = await first.history.session({ key, sessionId: "session" });
  await first.history.commit({
    key,
    sessionId: "session",
    expectedRevision: state.revision,
    generation: state.generation,
    sequence: state.sequence + 1,
    batchId: "after-relocation",
    operations: [
      {
        type: "putMessage",
        messageId: "new-message",
        position: 2,
        value: {
          id: "new-message",
          role: "user",
          content: "切换目录后的新消息",
          createdAt: legacyFixtureDate,
          status: "completed"
        }
      }
    ]
  });
  await first.close();
  vi.stubEnv("DEEPWRITE_MAIN_INSTANCE_ID", "fixture-reinstalled-main");
  const reinstalled = reopenApplication(original.profile);
  const restored = await loadConversationHistoryRecord(
    reinstalled.history,
    key,
    "session"
  );
  expect(restored.messages.map((message) => message.content)).toEqual([
    "原始正文 已修改",
    "原始正文",
    "切换目录后的新消息"
  ]);
  expect(new StorageLocationStore(original.profile).currentPath).toBe(
    target.profile
  );
  expect(
    JSON.parse(await readFile(locations.statePath, "utf8")).currentPath
  ).toBe(target.profile);
  expect(await readFile(target.source, "utf8")).toBe(original.original);
});

it("repairs a durable duplicate-import failure before the actual storage worker serves the restored history", async () => {
  const { original, target } = await fixture();
  const damagedState = new ConversationDatabase(target.path);
  try {
    damagedState.commit({
      key,
      sessionId: "session",
      expectedRevision: 1,
      generation: 0,
      sequence: 2,
      batchId: "remove-before-old-replay",
      operations: [{ type: "removeMessages", messageIds: ["first"] }]
    });
    await expect(
      replayLegacyUnderNewPath(damagedState, target.source)
    ).rejects.toThrow("duplicate message IDs");
    expect(damagedState.database.prepare("PRAGMA quick_check").get()).toEqual({
      quick_check: "ok"
    });
  } finally {
    damagedState.close();
  }
  vi.stubEnv("DEEPWRITE_MAIN_INSTANCE_ID", "fixture-recovered-main");
  const recovered = reopenApplication(original.profile);
  const record = await loadConversationHistoryRecord(
    recovered.history,
    key,
    "session"
  );
  expect(record.messages.map((message) => message.content)).toEqual([
    "原始正文"
  ]);
  expect(record.draft).toBe("已保存的新草稿");
  await recovered.close();
  vi.stubEnv("DEEPWRITE_MAIN_INSTANCE_ID", "fixture-recovered-restart");
  const restarted = reopenApplication(original.profile);
  expect(
    (await restarted.history.session({ key, sessionId: "session" }))
      .messageCount
  ).toBe(1);
});
