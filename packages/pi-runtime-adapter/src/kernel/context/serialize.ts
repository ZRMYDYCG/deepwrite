import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { textOf } from "./prune";
import type { ConversationContextState } from "./state";

const THINKING_CHARS = 2_000;

function clip(text: string, limit: number): string {
  return text.length <= limit
    ? text
    : `${text.slice(0, limit)}〔其余 ${(text.length - limit).toLocaleString("zh-CN")} 字已截断〕`;
}

function argumentText(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([key, value]) => {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      return `${key}=${text ?? ""}`;
    })
    .join(", ");
}

/**
 * Renders messages as labelled text so the summary model reads a transcript
 * instead of continuing it. Workspace snapshots are replaced by the user's
 * own words: the work itself remains readable through tools.
 */
export function serializeForSummary(
  messages: readonly AgentMessage[],
  state: ConversationContextState
): string {
  const parts: string[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      if (message === state.summaryMessage) continue;
      const turn = state.runtimeTurns.get(message);
      const text = textOf(turn?.rawContent ?? message.content).trim();
      if (text) {
        parts.push(
          `[用户]${turn?.snapshot ? "（本轮附带工作区快照，已略）" : ""}: ${text}`
        );
      }
      if (
        Array.isArray(message.content) &&
        message.content.some((block) => block.type === "image")
      ) {
        parts.push(
          "[附件说明]: 原消息包含图片，图片未输入这个文本摘要；不要猜测图片内容。原图片仍须单独保留。"
        );
      }
    } else if (message.role === "assistant") {
      const thinking = message.content
        .flatMap((block) => (block.type === "thinking" ? [block.thinking] : []))
        .join("\n")
        .trim();
      const text = message.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n")
        .trim();
      const calls = message.content.flatMap((block) =>
        block.type === "toolCall"
          ? [`${block.name}(${argumentText(block.arguments ?? {})})`]
          : []
      );
      if (thinking) parts.push(`[助手思考]: ${clip(thinking, THINKING_CHARS)}`);
      if (text) parts.push(`[助手]: ${text}`);
      if (calls.length) parts.push(`[助手调用工具]: ${calls.join("; ")}`);
      if (message.stopReason === "error" && message.errorMessage) {
        parts.push(`[请求失败]: ${clip(message.errorMessage, 300)}`);
      }
    } else if (message.role === "toolResult") {
      const text = textOf(message.content).trim();
      if (text) {
        parts.push(
          `[工具结果 ${message.toolName}${message.isError ? "（失败）" : ""}]: ${text}`
        );
      }
    }
  }
  return parts.join("\n\n");
}
