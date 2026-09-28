import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import {
  ESTIMATED_IMAGE_TOKENS,
  estimateTextTokens
} from "@deepwrite/contracts";

type ContentBlock = { type: string; text?: string };

function contentTokens(content: string | readonly ContentBlock[]): number {
  if (typeof content === "string") return estimateTextTokens(content);
  let tokens = 0;
  for (const block of content) {
    if (block.type === "text" && block.text) {
      tokens += estimateTextTokens(block.text);
    } else if (block.type === "image") {
      tokens += ESTIMATED_IMAGE_TOKENS;
    }
  }
  return tokens;
}

/** Tokenizer-free estimate of what one message adds to a request. */
export function estimateMessageTokens(message: AgentMessage): number {
  switch (message.role) {
    case "user":
      return contentTokens(message.content) + 4;
    case "toolResult":
      return contentTokens(message.content) + 8;
    case "assistant": {
      let tokens = 4;
      for (const block of message.content) {
        if (block.type === "text") tokens += estimateTextTokens(block.text);
        else if (block.type === "thinking") {
          tokens += estimateTextTokens(block.thinking);
        } else if (block.type === "toolCall") {
          tokens += estimateTextTokens(
            block.name + JSON.stringify(block.arguments ?? {})
          );
        }
      }
      return tokens;
    }
  }
  return 0;
}

export function estimateMessagesTokens(
  messages: readonly AgentMessage[]
): number {
  let total = 0;
  for (const message of messages) total += estimateMessageTokens(message);
  return total;
}

export function usageContextTokens(usage: Usage): number {
  return (
    usage.totalTokens ||
    usage.input + usage.output + usage.cacheRead + usage.cacheWrite
  );
}

function isMeasuredAssistant(
  message: AgentMessage,
  notBefore: number
): message is AssistantMessage {
  return (
    message.role === "assistant" &&
    message.stopReason !== "aborted" &&
    message.stopReason !== "error" &&
    message.timestamp > notBefore &&
    usageContextTokens(message.usage) > 0
  );
}

export interface ContextTokenEstimate {
  tokens: number;
  /** True when the figure is anchored on provider-reported usage. */
  measured: boolean;
}

/**
 * The last provider-reported usage plus an estimate of later messages. Usage
 * recorded before `notBefore` (a compaction) describes a larger, discarded
 * context and is ignored.
 */
export function estimateContextTokens(
  messages: readonly AgentMessage[],
  fixedTokens: number,
  notBefore = 0,
  model?: { id: string; provider: string }
): ContextTokenEstimate {
  const estimate = fixedTokens + estimateMessagesTokens(messages);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (!isMeasuredAssistant(message, notBefore)) continue;
    if (
      model &&
      (message.model !== model.id || message.provider !== model.provider)
    )
      continue;
    return {
      tokens: Math.max(
        estimate,
        usageContextTokens(message.usage) +
          estimateMessagesTokens(messages.slice(index + 1))
      ),
      measured: true
    };
  }
  return {
    tokens: estimate,
    measured: false
  };
}

/** System prompt and tool schemas: sent with every request, never compacted. */
export function estimateRunFixedTokens(
  systemPrompt: string,
  tools: readonly { name: string; description: string; parameters: unknown }[]
): number {
  return (
    estimateTextTokens(systemPrompt) +
    estimateTextTokens(
      JSON.stringify(
        tools.map(({ name, description, parameters }) => ({
          name,
          description,
          parameters
        }))
      )
    )
  );
}
