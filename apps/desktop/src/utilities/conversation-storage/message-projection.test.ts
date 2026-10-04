import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ConversationHistoryMessagesResultSchema } from "@deepwrite/contracts";
import { ConversationDatabase } from "./database";
import { JsonNodes } from "./json-nodes";

const resources: { root: string; database: ConversationDatabase }[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const { root, database } of resources.splice(0)) {
    database.close();
    await rm(root, { recursive: true, force: true });
  }
});

const identity = {
  key: "conversation-history:projection-fixture",
  sessionId: "session"
};
const messageIdentity = {
  id: "message",
  role: "assistant",
  createdAt: "2026-10-02T00:00:00.000Z",
  runId: "run",
  status: "completed"
};
async function open(value: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "deepwrite-message-projection-"));
  const database = new ConversationDatabase(join(root, "history.sqlite"));
  resources.push({ root, database });
  database.commit({
    ...identity,
    batchId: "create",
    generation: 0,
    sequence: 1,
    expectedRevision: 0,
    operations: [
      { type: "putMessage", messageId: "message", position: 0, value }
    ]
  });
  return database;
}

it("keeps identity and a display-only preview without materializing deferred body or process details", async () => {
  const content = "这是虚构正文😀。".repeat(20_000);
  const database = await open({
    content,
    thinking: "虚构思考".repeat(20_000),
    ...messageIdentity
  });
  const read = vi.spyOn(JsonNodes.prototype, "read");
  const page = database.messages({ ...identity, maxBytes: 4096 });
  expect(ConversationHistoryMessagesResultSchema.parse(page)).toEqual(page);
  const message = page.messages[0]!;
  expect(message.value).toEqual(messageIdentity);
  expect(message.preview).toBeTruthy();
  expect(content.startsWith(message.preview!.replace(/…$/, ""))).toBe(true);
  expect(message.details.map((reference) => reference.path)).toEqual([
    ["content"],
    ["thinking"]
  ]);
  expect(read.mock.calls.every(([reference]) => reference.bytes < 1024)).toBe(
    true
  );
  expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(4096);
});

it("retains identity and a bounded preview when many field references require a root detail", async () => {
  const value = {
    content: "虚构正文😀".repeat(3000),
    ...Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [
        `future-field-${index}`,
        "虚构详情".repeat(300)
      ])
    ),
    ...messageIdentity
  };
  const database = await open(value);
  const page = database.messages({ ...identity, maxBytes: 1024 });
  const message = page.messages[0]!;
  expect(message.value).toEqual(messageIdentity);
  expect(message.preview).toBeTruthy();
  expect(message.details).toEqual([
    { path: [], encoding: "json", byteLength: message.byteLength }
  ]);
  expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(1024);
  let offset = 0;
  const chunks: string[] = [];
  for (;;) {
    const detail = database.detail({
      ...identity,
      messageId: "message",
      path: [],
      expectedRevision: page.revision,
      maxBytes: 1024,
      offset
    });
    chunks.push(detail.chunk);
    if (detail.nextOffset === null) break;
    offset = detail.nextOffset;
  }
  expect(JSON.parse(chunks.join(""))).toEqual(value);
});

it("pages small budgets without dropping the identity of the next message", async () => {
  const database = await open({
    content: "正文".repeat(5000),
    ...messageIdentity
  });
  database.commit({
    ...identity,
    batchId: "append",
    generation: 0,
    expectedRevision: 1,
    sequence: 2,
    operations: Array.from({ length: 4 }, (_, index) => ({
      type: "putMessage",
      messageId: `next-${index}`,
      position: index + 1,
      value: {
        content: "后续正文".repeat(5000),
        ...messageIdentity,
        id: `next-${index}`
      }
    }))
  });
  let afterPosition: number | undefined;
  const ids: unknown[] = [];
  let pageCount = 0;
  for (;;) {
    const page = database.messages({
      ...identity,
      maxBytes: 1024,
      afterPosition
    });
    pageCount += 1;
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(1024);
    ids.push(...page.messages.map((message) => message.value.id));
    if (page.nextPosition === null) break;
    expect(page.nextPosition).toBeGreaterThan(afterPosition ?? -1);
    afterPosition = page.nextPosition;
  }
  expect(pageCount).toBeGreaterThan(1);
  expect(ids).toEqual(["message", "next-0", "next-1", "next-2", "next-3"]);
});

it("counts the page envelope, cursor and inter-message commas in both directions", async () => {
  const database = await open({ content: "short", ...messageIdentity });
  database.commit({
    ...identity,
    batchId: "many",
    generation: 0,
    expectedRevision: 1,
    sequence: 2,
    operations: Array.from({ length: 199 }, (_, index) => ({
      type: "putMessage",
      messageId: `m-${index}`,
      position: index + 1,
      value: { content: "short", ...messageIdentity, id: `m-${index}` }
    }))
  });
  for (const direction of ["forward", "backward"] as const) {
    for (const maxBytes of [1024, 30_000, 30_001, 50_000]) {
      let afterPosition: number | undefined;
      const ids = new Set<string>();
      for (;;) {
        const page = database.messages({
          ...identity,
          limit: 200,
          maxBytes,
          direction,
          afterPosition
        });
        expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(
          maxBytes
        );
        for (const message of page.messages) {
          expect(ids.has(message.messageId)).toBe(false);
          expect(message.value.id).toBe(message.messageId);
          ids.add(message.messageId);
        }
        if (page.nextPosition === null) break;
        expect(page.nextPosition).not.toBe(afterPosition);
        afterPosition = page.nextPosition;
      }
      expect(ids.size).toBe(200);
    }
  }
});

it("defers a large identity to the next page rather than rejecting a partly full page", async () => {
  const value = {
    content: "c".repeat(1700),
    ...messageIdentity,
    runId: "r".repeat(1100)
  };
  const database = await open(value);
  database.commit({
    ...identity,
    batchId: "long-id",
    generation: 0,
    expectedRevision: 1,
    sequence: 2,
    operations: [
      {
        type: "putMessage",
        messageId: "next",
        position: 1,
        value: { ...value, id: "next" }
      }
    ]
  });
  const first = database.messages({ ...identity, maxBytes: 4096, limit: 2 });
  expect(first.messages).toHaveLength(1);
  expect(first.messages[0]!.value).toEqual(value);
  const second = database.messages({
    ...identity,
    maxBytes: 4096,
    afterPosition: first.nextPosition!
  });
  expect(second.messages[0]!.value).toEqual({ ...value, id: "next" });
  expect(second.nextPosition).toBeNull();
});
