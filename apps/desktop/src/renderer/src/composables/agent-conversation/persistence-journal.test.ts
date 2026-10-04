import { describe, expect, it } from "vitest";
import { ref, shallowRef } from "vue";
import type { ChatMessage } from "../../types/conversation";
import { createPersistenceJournal } from "./persistence-journal";
import {
  captureFieldChanges,
  recordFieldMutation
} from "./persistence-field-changes";
import type { MessageMutation } from "./message-mutations";
import { useAgentConversation } from "../useAgentConversation";

const timestamp = "2026-09-11T00:00:00.000Z";
const message = (id: string, content = "A"): ChatMessage => ({
  id,
  role: "assistant",
  content,
  createdAt: timestamp
});
function setup(messages = [message("m")]) {
  const ctx: Parameters<typeof createPersistenceJournal>[0] = {
    messages: shallowRef(messages),
    sessionId: ref("local"),
    draft: ref(""),
    approvalMode: ref("request-approval"),
    currentCreatedAt: ref(timestamp),
    currentUpdatedAt: ref(timestamp),
    temperature: ref(0.7),
    storedConversations: shallowRef([]),
    storedEnvelope: undefined,
    persistenceMutationRevision: 0
  };
  const journal = createPersistenceJournal(ctx);
  function changed(mutation: MessageMutation) {
    ctx.persistenceMutationRevision++;
    journal.record(mutation);
  }
  function append(text: string) {
    const current = ctx.messages.value[0]!;
    const previous = current.content;
    current.content += text;
    changed({
      type: "field",
      message: current,
      path: ["content"],
      previous,
      value: current.content,
      removed: false
    });
  }
  return { ctx, journal, changed, append };
}

describe("conversation journal ownership and confirmed retention", () => {
  it("rejects a released loaded session until its ID-only baseline is reinitialized", () => {
    const { ctx, journal, append } = setup();
    journal.initializeBaseline();
    journal.forgetSession("local");
    expect(() => journal.capture()).toThrow("initialized journal baseline");
    journal.initializeSessionBaseline("local");
    expect(journal.capture().conversations).toEqual([]);
    append("B");
    expect(journal.capture().conversations[0]?.operations).toEqual([
      {
        type: "patchMessage",
        messageId: "m",
        changes: [{ op: "append", path: ["content"], text: "B" }]
      }
    ]);
    expect(ctx.messages.value[0]?.content).toBe("AB");
  });

  it("rejects an unregistered archived projection instead of putting it over saved details", () => {
    const { ctx, journal } = setup();
    journal.initializeBaseline();
    ctx.storedConversations.value = [
      {
        sessionId: "loaded",
        messages: [message("projection")],
        draft: "",
        approvalMode: "request-approval",
        temperature: 0.7,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ];
    expect(() => journal.capture()).toThrow("initialized journal baseline");
    journal.initializeSessionBaseline("loaded");
    expect(journal.capture().conversations).toEqual([]);
  });

  it("retains only dirty message references and preserves later edits across a late acknowledgement", () => {
    const { journal, append } = setup();
    const baseline = journal.capture();
    journal.acknowledge(baseline.revision);
    expect(journal.diagnostics()).toMatchObject({
      retainedMessageCount: 0,
      captureCount: 0
    });
    append("B");
    const first = journal.capture();
    append("C");
    expect(journal.diagnostics()).toMatchObject({
      retainedMessageCount: 1,
      pendingFieldCount: 2
    });
    journal.acknowledge(first.revision);
    expect(journal.diagnostics()).toMatchObject({
      retainedMessageCount: 1,
      pendingFieldCount: 1
    });
    const second = journal.capture();
    expect(second.conversations[0]?.operations).toEqual([
      {
        type: "patchMessage",
        messageId: "m",
        changes: [{ op: "append", path: ["content"], text: "C" }]
      }
    ]);
    journal.acknowledge(first.revision);
    expect(journal.capture()).toEqual(second);
    journal.acknowledge(second.revision);
    expect(journal.diagnostics()).toMatchObject({
      retainedMessageCount: 0,
      pendingFieldCount: 0,
      captureCount: 0
    });
    append("D");
    expect(journal.capture().conversations[0]?.operations).toEqual([
      {
        type: "patchMessage",
        messageId: "m",
        changes: [{ op: "append", path: ["content"], text: "D" }]
      }
    ]);
  });

  it("uses current captured membership to discard mutations for explicitly removed messages", () => {
    const { ctx, journal, changed, append } = setup([
      message("m"),
      message("survivor")
    ]);
    journal.initializeBaseline();
    append("discarded");
    ctx.messages.value.splice(0, 1);
    changed({ type: "structure" });
    const capture = journal.capture();
    expect(capture.conversations[0]?.operations).toEqual([
      { type: "moveMessage", messageId: "survivor", position: 0 },
      { type: "removeMessages", messageIds: ["m"] }
    ]);
    journal.acknowledge(capture.revision);
    expect(journal.diagnostics().retainedMessageCount).toBe(0);
  });

  it("keeps only confirmed ID indexes after saving and switching through 100 local conversations", () => {
    const { ctx, journal, changed, append } = setup();
    for (let index = 0; index < 100; index++) {
      if (index) {
        ctx.storedConversations.value.push({
          sessionId: ctx.sessionId.value,
          messages: ctx.messages.value,
          draft: "",
          approvalMode: "request-approval",
          temperature: 0.7,
          createdAt: timestamp,
          updatedAt: timestamp
        });
        const sessionId = `local-${index}`;
        journal.registerLocalSession(sessionId);
        ctx.sessionId.value = sessionId;
        ctx.messages.value = [message(`message-${index}`)];
        changed({ type: "structure" });
      }
      append("saved");
      const capture = journal.capture();
      journal.acknowledge(capture.revision);
      expect(journal.diagnostics()).toEqual({
        sessionCount: index + 1,
        retainedMessageCount: 0,
        pendingFieldCount: 0,
        captureCount: 0
      });
    }
    const first = ctx.storedConversations.value[0]!;
    ctx.sessionId.value = first.sessionId;
    ctx.messages.value = first.messages;
    append("revisited");
    expect(journal.capture().conversations[0]?.operations).toEqual([
      {
        type: "patchMessage",
        messageId: "m",
        changes: [{ op: "append", path: ["content"], text: "revisited" }]
      }
    ]);
  });

  it("keeps legacy complete imports explicit while Core-loaded history never becomes a baseline put", async () => {
    const record = {
      sessionId: "loaded",
      messages: [message("m")],
      draft: "",
      approvalMode: "request-approval" as const,
      temperature: 0.7,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const imported = useAgentConversation({
      api: () => undefined,
      initialPersistenceSnapshot: {
        version: 1,
        activeSessionId: record.sessionId,
        conversations: [record]
      }
    });
    const hydrated = useAgentConversation({ api: () => undefined });
    try {
      expect(
        imported.capturePersistenceChanges().conversations[0]?.operations[0]
          ?.type
      ).toBe("putMessage");
      const loading = hydrated.restorePersistenceSnapshot({
        version: 1,
        activeSessionId: record.sessionId,
        conversations: [record]
      });
      hydrated.draft.value = "local draft wins";
      expect(await loading).toBe(false);
      expect(hydrated.capturePersistenceChanges().conversations).toEqual([]);
      expect(hydrated.selectConversation(record.sessionId)).toBe(true);
      expect(
        hydrated
          .capturePersistenceChanges()
          .conversations.flatMap((value) => value.operations)
      ).toEqual([]);
    } finally {
      imported.dispose();
      hydrated.dispose();
    }
  });
});

function field(
  current: ChatMessage,
  path: (string | number)[],
  removed = false
) {
  return recordFieldMutation(
    {
      type: "field",
      message: current,
      path,
      previous: "old",
      value: removed ? undefined : "changed",
      removed
    },
    1
  );
}

describe("explicit field removal and missing detail protection", () => {
  it("does not treat an absent projected field as a deletion", () => {
    const current = message("m");
    expect(() =>
      captureFieldChanges([field(current, ["thinking"])], current)
    ).toThrow("unloaded conversation field");
    expect(
      captureFieldChanges([field(current, ["thinking"], true)], current)
    ).toEqual([{ op: "remove", path: ["thinking"] }]);
  });

  it("rejects writes and explicit removals below an unloaded detail", () => {
    const current = message("m");
    for (const removed of [false, true])
      expect(() =>
        captureFieldChanges(
          [field(current, ["toolCalls", 0, "result"], removed)],
          current
        )
      ).toThrow("unloaded conversation detail");
    const appended = {
      ...field(current, ["processingSteps", 0, "content"]),
      appendText: "tail"
    };
    expect(() => captureFieldChanges([appended], current)).toThrow(
      "unloaded conversation detail"
    );
  });

  it("captures explicit removal from a loaded parent and current values recreated after a removal", () => {
    const current = {
      ...message("m"),
      toolCalls: [
        {
          id: "tool",
          name: "read",
          args: {},
          status: "completed" as const,
          requestedAt: timestamp
        }
      ]
    };
    expect(
      captureFieldChanges(
        [field(current, ["toolCalls", 0, "result"], true)],
        current
      )
    ).toEqual([{ op: "remove", path: ["toolCalls", 0, "result"] }]);
    current.content = "new";
    expect(
      captureFieldChanges([field(current, ["content"], true)], current)
    ).toEqual([{ op: "set", path: ["content"], value: "new" }]);
  });
});
