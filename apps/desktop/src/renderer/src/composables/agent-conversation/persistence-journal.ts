import type { ConversationHistoryOperation } from "@deepwrite/contracts";
import type { AgentConversationContext } from "./context";
import type { MessageMutation } from "./message-mutations";
import {
  captureFieldChanges,
  recordFieldMutation,
  type FieldMutation
} from "./persistence-field-changes";
import {
  clonePersistenceRecord,
  type ConversationPersistenceChanges
} from "./persistence-changes";

type JournalContext = Pick<
  AgentConversationContext,
  | "messages"
  | "sessionId"
  | "draft"
  | "approvalMode"
  | "currentCreatedAt"
  | "currentUpdatedAt"
  | "temperature"
  | "storedConversations"
  | "storedEnvelope"
  | "persistenceMutationRevision"
>;
interface SessionChanges {
  baseline: boolean;
  metadataRevision: number;
  structureRevision: number | undefined;
  fields: FieldMutation[];
  replacements: Map<string, number>;
  order: Map<string, number>;
}

export function createPersistenceJournal(ctx: JournalContext) {
  const sessions = new Map<string, SessionChanges>();
  const captures = new Map<
    number,
    { orders: Map<string, Map<string, number>>; sessionIds: Set<string> }
  >();
  /** Only locally created identities and explicit legacy imports may be put in full. */
  function registerLocalSession(sessionId: string): void {
    if (!sessions.has(sessionId))
      sessions.set(sessionId, {
        baseline: true,
        metadataRevision: 0,
        structureRevision: 0,
        fields: [],
        replacements: new Map(),
        order: new Map()
      });
  }
  function requireSession(sessionId: string): SessionChanges {
    const state = sessions.get(sessionId);
    if (!state)
      throw new Error(
        "Cannot save a conversation without an initialized journal baseline."
      );
    return state;
  }
  function source(sessionId: string) {
    if (sessionId === ctx.sessionId.value)
      return {
        sessionId,
        messages: ctx.messages.value,
        draft: ctx.draft.value,
        approvalMode: ctx.approvalMode.value,
        createdAt: ctx.currentCreatedAt.value,
        updatedAt: ctx.currentUpdatedAt.value,
        temperature: ctx.temperature.value
      };
    return ctx.storedConversations.value.find(
      (record) => record.sessionId === sessionId
    );
  }
  function record(mutation?: MessageMutation): void {
    const state = requireSession(ctx.sessionId.value);
    const revision = ctx.persistenceMutationRevision;
    state.metadataRevision = revision;
    if (mutation?.type === "structure") {
      state.structureRevision = revision;
      for (const message of mutation.changedMessages ?? [])
        state.replacements.set(message.id, revision);
    }
    if (mutation?.type === "field")
      state.fields.push(recordFieldMutation(mutation, revision));
  }
  function capture(
    excluded: ReadonlySet<string> = new Set()
  ): ConversationPersistenceChanges {
    // A loaded projection must never become a full replacement merely because
    // its old journal entry was released. Loading must initialize its IDs first.
    for (const conversation of ctx.storedConversations.value)
      requireSession(conversation.sessionId);
    requireSession(ctx.sessionId.value);
    const revision = ctx.persistenceMutationRevision;
    const result: ConversationPersistenceChanges = {
      revision,
      activeSessionId: ctx.sessionId.value,
      conversations: []
    };
    if (excluded.size) result.deferredSessionIds = [...excluded];
    const capturedOrders = new Map<string, Map<string, number>>();
    for (const [sessionId, state] of sessions) {
      if (excluded.has(sessionId)) continue;
      if (
        !state.baseline &&
        state.metadataRevision < 0 &&
        !state.fields.length &&
        state.structureRevision === undefined
      )
        continue;
      const conversation = source(sessionId);
      // Empty drafts never create a session. Keep deletions for an already
      // persisted session so removing its last message cannot resurrect it.
      if (
        !conversation ||
        (conversation.messages.length === 0 && state.order.size === 0)
      )
        continue;
      const operations: ConversationHistoryOperation[] = [];
      const puts = new Set<string>();
      let currentOrder = state.order;
      if (state.baseline || state.structureRevision !== undefined) {
        const order = new Map<string, number>();
        const persistedMessages = conversation.messages.filter(
          (message) => !message.activityOnly || Boolean(message.runId)
        );
        persistedMessages.forEach((message, position) => {
          order.set(message.id, position);
          if (
            state.baseline ||
            !state.order.has(message.id) ||
            state.replacements.has(message.id)
          ) {
            puts.add(message.id);
            operations.push({
              type: "putMessage",
              messageId: message.id,
              position,
              value: clonePersistenceRecord(message)
            });
          } else if (state.order.get(message.id) !== position) {
            operations.push({
              type: "moveMessage",
              messageId: message.id,
              position
            });
          }
        });
        const removed = [...state.order.keys()].filter((id) => !order.has(id));
        for (let offset = 0; offset < removed.length; offset += 4096)
          operations.push({
            type: "removeMessages",
            messageIds: removed.slice(offset, offset + 4096)
          });
        capturedOrders.set(sessionId, order);
        currentOrder = order;
      }
      const byMessage = new Map<string, FieldMutation[]>();
      for (const field of state.fields) {
        const messageId = field.message.id;
        if (puts.has(messageId) || !currentOrder.has(messageId)) continue;
        const fields = byMessage.get(messageId) ?? [];
        fields.push(field);
        byMessage.set(messageId, fields);
      }
      for (const [messageId, fields] of byMessage) {
        const changes = captureFieldChanges(fields, fields.at(-1)!.message);
        for (let offset = 0; offset < changes.length; offset += 4096)
          operations.push({
            type: "patchMessage",
            messageId,
            changes: changes.slice(offset, offset + 4096)
          });
      }
      const { messages: _messages, ...metadata } = conversation;
      result.conversations.push({ sessionId, metadata, operations });
    }
    captures.set(revision, {
      orders: capturedOrders,
      sessionIds: new Set(
        result.conversations.map((record) => record.sessionId)
      )
    });
    return result;
  }
  function acknowledge(revision: number): void {
    const captured = captures.get(revision);
    if (!captured) return;
    for (const [sessionId, state] of sessions) {
      if (!captured.sessionIds.has(sessionId)) continue;
      const order = captured.orders.get(sessionId);
      if (order) {
        state.order = order;
        state.baseline = false;
      }
      for (const [messageId, changedAt] of state.replacements)
        if (changedAt <= revision) state.replacements.delete(messageId);
      state.fields = state.fields.filter((field) => field.revision > revision);
      if (state.metadataRevision <= revision) state.metadataRevision = -1;
      if (
        state.structureRevision !== undefined &&
        state.structureRevision <= revision
      )
        state.structureRevision = undefined;
    }
    for (const checkpoint of captures.keys())
      if (checkpoint <= revision) captures.delete(checkpoint);
  }
  function initializeBaseline(): boolean {
    if (ctx.persistenceMutationRevision !== 0) return false;
    sessions.clear();
    captures.clear();
    for (const sessionId of new Set([
      ctx.sessionId.value,
      ...ctx.storedConversations.value.map((record) => record.sessionId)
    ])) {
      const conversation = source(sessionId);
      if (!conversation) continue;
      registerLocalSession(sessionId);
      const state = requireSession(sessionId);
      state.baseline = false;
      state.metadataRevision = -1;
      state.structureRevision = undefined;
      conversation.messages.forEach((message, position) => {
        state.order.set(message.id, position);
      });
    }
    return true;
  }
  function forgetSession(sessionId: string): void {
    sessions.delete(sessionId);
    for (const captured of captures.values()) {
      captured.orders.delete(sessionId);
      captured.sessionIds.delete(sessionId);
    }
  }
  /** A newly loaded complete record already exists on disk; never re-put its parsed projection. */
  function initializeSessionBaseline(sessionId: string): void {
    const conversation = source(sessionId);
    if (!conversation)
      throw new Error("Cannot initialize an unloaded conversation baseline.");
    const previous = sessions.get(sessionId);
    if (
      previous &&
      (previous.baseline ||
        previous.fields.length ||
        previous.replacements.size ||
        previous.structureRevision !== undefined ||
        previous.metadataRevision >= 0)
    )
      throw new Error("Cannot replace an unconfirmed conversation baseline.");
    forgetSession(sessionId);
    registerLocalSession(sessionId);
    const state = requireSession(sessionId);
    state.baseline = false;
    state.metadataRevision = -1;
    state.structureRevision = undefined;
    conversation.messages.forEach((message, position) => {
      state.order.set(message.id, position);
    });
  }
  function reset(): void {
    sessions.clear();
    captures.clear();
  }
  function hasChangesAfter(sessionId: string, revision: number): boolean {
    const state = sessions.get(sessionId);
    return Boolean(
      state &&
      (state.metadataRevision > revision ||
        (state.structureRevision ?? -1) > revision ||
        state.fields.some((field) => field.revision > revision))
    );
  }
  // The compatibility snapshot API also accepts complete legacy imports. Core
  // hydration explicitly replaces these with acknowledged ID-only baselines.
  for (const record of ctx.storedEnvelope?.conversations ?? [])
    registerLocalSession(record.sessionId);
  registerLocalSession(ctx.sessionId.value);
  return {
    record,
    capture,
    acknowledge,
    initializeBaseline,
    initializeSessionBaseline,
    forgetSession,
    hasChangesAfter,
    registerLocalSession,
    diagnostics() {
      const fields = [...sessions.values()].flatMap((state) => state.fields);
      return {
        sessionCount: sessions.size,
        retainedMessageCount: new Set(fields.map((field) => field.message))
          .size,
        pendingFieldCount: fields.length,
        captureCount: captures.size
      };
    },
    reset
  };
}

export type ConversationPersistenceJournal = ReturnType<
  typeof createPersistenceJournal
>;
