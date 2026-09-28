import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  AssistantMessage,
  TextContent,
  ToolCall,
  ToolResultMessage,
  UserMessage
} from "@earendil-works/pi-ai";
import type { ConversationContextState } from "./state";
import type { ToolCompactor } from "./types";

export const SNAPSHOT_STUB =
  "〔本轮发送时附带的工作区快照已省略；作品结构以最新一轮的快照和工具读取结果为准。〕";

function characters(text: string): string {
  return text.length.toLocaleString("zh-CN");
}

export function headTail(text: string, head: number, tail: number): string {
  if (text.length <= head + tail) return text;
  return `${text.slice(0, head)}\n〔中间 ${characters(
    text.slice(head, text.length - tail)
  )} 字已省略〕\n${text.slice(text.length - tail)}`;
}

export function textOf(
  content: UserMessage["content"] | ToolResultMessage["content"]
): string {
  if (typeof content === "string") return content;
  return content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function pruneUser(
  message: UserMessage,
  state: ConversationContextState
): UserMessage | undefined {
  const turn = state.runtimeTurns.get(message);
  if (!turn?.snapshot) return undefined;
  // User instructions and attachments are irreplaceable. Only generated
  // snapshots can be removed without a semantic summary.
  const blocks =
    typeof turn.rawContent === "string"
      ? [{ type: "text" as const, text: turn.rawContent }]
      : turn.rawContent;
  return {
    ...message,
    content: [{ type: "text", text: SNAPSHOT_STUB }, ...blocks]
  };
}

function pruneAssistant(
  message: AssistantMessage,
  compactors: Readonly<Record<string, ToolCompactor>>,
  successfulCalls: ReadonlySet<string>
): AssistantMessage | undefined {
  // Provider signatures may bind the original thought/call payload. Keep
  // signed messages intact until the entire exchange is summarized.
  if (
    message.content.some(
      (block) =>
        (block.type === "toolCall" && block.thoughtSignature) ||
        (block.type === "thinking" && block.thinkingSignature)
    )
  )
    return undefined;
  let changed = false;
  const hasVisible = message.content.some((block) => block.type !== "thinking");
  const content: AssistantMessage["content"] = [];
  for (const block of message.content) {
    if (block.type === "thinking" && hasVisible) {
      changed = true;
      continue;
    }
    if (block.type !== "toolCall") {
      content.push(block);
      continue;
    }
    const args = block.arguments ?? {};
    const replaced = successfulCalls.has(block.id)
      ? compactors[block.name]?.args?.(args)
      : undefined;
    if (replaced) changed = true;
    content.push(replaced ? { ...block, arguments: replaced } : block);
  }
  if (!changed) return undefined;
  const updated = { ...message, content };
  delete updated.responseId;
  return updated;
}

function pruneToolResult(
  message: ToolResultMessage,
  call: ToolCall | undefined,
  compactors: Readonly<Record<string, ToolCompactor>>
): ToolResultMessage | undefined {
  const compactor = compactors[message.toolName];
  const stub = compactor?.result ? compactor.result(message, call) : undefined;
  if (stub !== undefined) {
    return { ...message, content: [{ type: "text", text: stub }] };
  }
  return undefined;
}

export function toolCallsById(
  messages: readonly AgentMessage[]
): Map<string, ToolCall> {
  const calls = new Map<string, ToolCall>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const block of message.content) {
      if (block.type === "toolCall") calls.set(block.id, block);
    }
  }
  return calls;
}

export interface PruneResult {
  messages: AgentMessage[];
  changed: boolean;
  /** True when an old workspace snapshot was replaced by a stub. */
  snapshotStubbed: boolean;
}

/**
 * Deterministic first-level compaction: shrinks messages before
 * `protectFrom` without asking a model. Tool calls stay paired with their
 * results and unchanged messages keep their identity.
 */
export function pruneMessages(
  messages: readonly AgentMessage[],
  protectFrom: number,
  compactors: Readonly<Record<string, ToolCompactor>>,
  state: ConversationContextState
): PruneResult {
  const calls = toolCallsById(messages);
  const successfulCalls = new Set(
    messages.flatMap((message) =>
      message.role === "toolResult" && !message.isError
        ? [message.toolCallId]
        : []
    )
  );
  let changed = false;
  let snapshotStubbed = false;
  const next = messages.map((message, index) => {
    if (index >= protectFrom || state.pruned.has(message)) return message;
    if (message === state.summaryMessage) return message;
    let replacement: AgentMessage | undefined;
    if (message.role === "user") {
      snapshotStubbed ||= state.runtimeTurns.get(message)?.snapshot === true;
      replacement = pruneUser(message, state);
    } else if (message.role === "assistant") {
      replacement = pruneAssistant(message, compactors, successfulCalls);
    } else if (message.role === "toolResult") {
      replacement = pruneToolResult(
        message,
        calls.get(message.toolCallId),
        compactors
      );
    }
    if (!replacement) {
      state.pruned.add(message);
      return message;
    }
    state.transfer(message, replacement);
    changed = true;
    return replacement;
  });
  return { messages: next, changed, snapshotStubbed };
}
