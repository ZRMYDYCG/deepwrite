import { createScopedTranslator } from "../../i18n";
import type { AgentConversationContext } from "./context";
import type { AgentRuntimeRef } from "@deepwrite/contracts";
import type { ChatMessage } from "../../types/conversation";
import { id } from "./shared";

const t = createScopedTranslator("workspace.messageIdentity");

type MessageIdentityContext = Pick<
  AgentConversationContext,
  "runMessageIds" | "messages" | "failProtocol" | "messageMutations"
>;

function isUnclaimedPendingAssistant(message: ChatMessage): boolean {
  return (
    message.role === "assistant" &&
    message.activityOnly === true &&
    message.status === "streaming" &&
    !message.runId
  );
}

export function createPendingAssistantMessage(
  ctx: Pick<MessageIdentityContext, "messages" | "messageMutations">
): ChatMessage {
  discardPendingAssistantMessage(ctx);
  const createdAt = new Date().toISOString();
  const message: ChatMessage = {
    id: id("assistant"),
    role: "assistant",
    content: "",
    createdAt,
    status: "streaming",
    activityOnly: true,
    processingStartedAt: createdAt,
    toolCalls: [],
    processingSteps: []
  };
  ctx.messages.value.push(message);
  return ctx.messageMutations.findById(message.id)!;
}

export function discardPendingAssistantMessage(
  ctx: Pick<MessageIdentityContext, "messages">,
  messageId?: string
): void {
  const index = ctx.messages.value.findIndex(
    (message) =>
      isUnclaimedPendingAssistant(message) &&
      (messageId === undefined || message.id === messageId)
  );
  if (index < 0) return;
  ctx.messages.value.splice(index, 1);
}

export function claimPendingActivityPlaceholder(
  ctx: Pick<MessageIdentityContext, "messages" | "runMessageIds">,
  runId: string,
  eventRuntime?: AgentRuntimeRef
): ChatMessage | undefined {
  if (ctx.runMessageIds.has(runId)) return undefined;
  if (
    ctx.messages.value.some(
      (message) => message.role === "assistant" && message.runId === runId
    )
  ) {
    return undefined;
  }
  const pending = ctx.messages.value.find(isUnclaimedPendingAssistant);
  if (!pending) return undefined;
  pending.runId = runId;
  const preferredId = `${runId}_assistant`;
  if (
    pending.id !== preferredId &&
    !ctx.messages.value.some((message) => message.id === preferredId)
  ) {
    pending.id = preferredId;
  }
  if (eventRuntime) pending.runtime = eventRuntime;
  ctx.runMessageIds.set(runId, pending.id);
  return pending;
}

export function assistantMessageForRun(
  ctx: MessageIdentityContext,
  runId: string
): ChatMessage | undefined {
  const mappedMessageId = ctx.runMessageIds.get(runId);
  return (
    (mappedMessageId
      ? ctx.messages.value.find(
          (message) =>
            message.id === mappedMessageId &&
            message.role === "assistant" &&
            message.runId === runId
        )
      : undefined) ??
    ctx.messages.value.find(
      (message) => message.role === "assistant" && message.runId === runId
    )
  );
}
export function ensureAssistantMessage(
  ctx: MessageIdentityContext,
  runId: string,
  messageId: string,
  eventRuntime?: AgentRuntimeRef,
  createdAt = new Date().toISOString()
): ChatMessage | undefined {
  claimPendingActivityPlaceholder(ctx, runId, eventRuntime);
  const mappedMessageId = ctx.runMessageIds.get(runId);
  if (mappedMessageId && mappedMessageId !== messageId) {
    const placeholder = ctx.messages.value.find(
      (message) =>
        message.id === mappedMessageId &&
        message.role === "assistant" &&
        message.runId === runId &&
        message.activityOnly
    );
    if (
      !placeholder ||
      ctx.messages.value.some((message) => message.id === messageId)
    ) {
      ctx.failProtocol(
        runId,
        t("theAgentReturnedInconsistentMessageIdsForTheSame"),
        eventRuntime
      );
      return undefined;
    }
    placeholder.id = messageId;
    placeholder.activityOnly = false;
    if (eventRuntime) {
      placeholder.runtime = eventRuntime;
    }
    ctx.runMessageIds.set(runId, messageId);
    return placeholder;
  }
  const existing = ctx.messageMutations.findById(messageId);
  if (existing) {
    if (existing.role !== "assistant" || existing.runId !== runId) {
      ctx.failProtocol(
        runId,
        t("theAgentMessageIdConflictsWithAnExistingMessage"),
        eventRuntime
      );
      return undefined;
    }
    ctx.runMessageIds.set(runId, messageId);
    existing.activityOnly = false;
    if (eventRuntime) {
      existing.runtime = eventRuntime;
    }
    return existing;
  }
  const message: ChatMessage = {
    id: messageId,
    role: "assistant",
    content: "",
    createdAt,
    runId,
    status: "streaming",
    ...(eventRuntime ? { runtime: eventRuntime } : {})
  };
  ctx.runMessageIds.set(runId, messageId);
  ctx.messages.value.push(message);
  return ctx.messageMutations.findById(messageId)!;
}
export function ensureActivityMessage(
  ctx: MessageIdentityContext,
  runId: string,
  eventRuntime: AgentRuntimeRef,
  createdAt: string
): ChatMessage {
  claimPendingActivityPlaceholder(ctx, runId, eventRuntime);
  const mappedMessageId = ctx.runMessageIds.get(runId);
  const existing = mappedMessageId
    ? ctx.messages.value.find(
        (message) =>
          message.id === mappedMessageId &&
          message.role === "assistant" &&
          message.runId === runId
      )
    : undefined;
  if (existing) {
    existing.runtime = eventRuntime;
    return existing;
  }
  const message: ChatMessage = {
    id: `${runId}_assistant`,
    role: "assistant",
    content: "",
    createdAt,
    runId,
    status: "streaming",
    runtime: eventRuntime,
    activityOnly: true,
    toolCalls: [],
    processingSteps: []
  };
  ctx.runMessageIds.set(runId, message.id);
  ctx.messages.value.push(message);
  return ctx.messageMutations.findById(message.id)!;
}
export function ensureSubagentMessage(
  ctx: MessageIdentityContext,
  runId: string,
  createdAt: string
): ChatMessage {
  claimPendingActivityPlaceholder(ctx, runId);
  const mappedMessageId = ctx.runMessageIds.get(runId);
  const existing = mappedMessageId
    ? ctx.messages.value.find(
        (message) =>
          message.id === mappedMessageId &&
          message.role === "assistant" &&
          message.runId === runId
      )
    : ctx.messages.value.find(
        (message) => message.role === "assistant" && message.runId === runId
      );
  if (existing) {
    ctx.runMessageIds.set(runId, existing.id);
    return existing;
  }
  const preferredId = `${runId}_assistant`;
  const message: ChatMessage = {
    id: ctx.messages.value.some((candidate) => candidate.id === preferredId)
      ? `${preferredId}_${id("subagent")}`
      : preferredId,
    role: "assistant",
    content: "",
    createdAt,
    runId,
    status: "streaming",
    activityOnly: true,
    toolCalls: [],
    processingSteps: [],
    subagentRuns: []
  };
  ctx.runMessageIds.set(runId, message.id);
  ctx.messages.value.push(message);
  return ctx.messageMutations.findById(message.id)!;
}
