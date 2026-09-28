import type {
  ConversationCheckpoint,
  SessionConversationHistoryMessage
} from "@deepwrite/contracts";
import {
  SESSION_CONVERSATION_HISTORY_MAX_MESSAGES,
  SESSION_CONVERSATION_HISTORY_MAX_MESSAGE_LENGTH,
  SESSION_CONVERSATION_HISTORY_MAX_CONTENT_LENGTH
} from "@deepwrite/contracts/renderer";
import type { ChatMessage } from "../../types/conversation";
import { latestConversationCheckpoint } from "./context-compaction";

export interface ConversationRestore {
  history: SessionConversationHistoryMessage[];
  /** Summary of the turns before `history`, when the conversation has one. */
  checkpoint?: ConversationCheckpoint;
}

/** Each user message is attributed to the run that answered it. */
function runIdAt(
  messages: readonly ChatMessage[],
  index: number
): string | undefined {
  const message = messages[index];
  if (message?.role === "assistant") return message.runId;
  const reply = messages[index + 1];
  return reply?.role === "assistant" ? reply.runId : undefined;
}

/**
 * Build a bounded, model-visible transcript from persisted presentation state:
 * the latest compaction checkpoint plus the turns it kept verbatim. Runtime
 * restores it only when the in-memory agent for this session is absent.
 */
export function buildConversationRestore(
  messages: readonly ChatMessage[]
): ConversationRestore {
  const located = latestConversationCheckpoint(messages);
  const start = located?.keepFrom ?? 0;
  const history: SessionConversationHistoryMessage[] = [];
  let contentLength = 0;

  for (let index = messages.length - 1; index >= start; index -= 1) {
    const message = messages[index];
    if (!message || message.activityOnly || !message.content.trim()) continue;
    if (!Number.isFinite(Date.parse(message.createdAt))) continue;
    const content = message.attachments?.length
      ? `${message.content}\n\n【历史附件说明】${message.attachments.map((attachment) => attachment.name).join("、")}。本条只恢复了附件名称，原始附件未在会话记录中保存；需要核对或引用原文、图片时，请用户重新上传。`
      : message.content;
    if (
      history.length >= SESSION_CONVERSATION_HISTORY_MAX_MESSAGES ||
      content.length > SESSION_CONVERSATION_HISTORY_MAX_MESSAGE_LENGTH ||
      contentLength + content.length >
        SESSION_CONVERSATION_HISTORY_MAX_CONTENT_LENGTH
    ) {
      throw new Error(
        "会话历史超过恢复传输上限，未截断或发送。请从已有检查点新建会话，原对话仍保留。"
      );
    }

    const runId = runIdAt(messages, index);
    history.unshift({
      role: message.role,
      content,
      createdAt: message.createdAt,
      ...(runId ? { runId } : {})
    });
    contentLength += content.length;
  }

  return located ? { history, checkpoint: located.checkpoint } : { history };
}

export function buildConversationHistory(
  messages: readonly ChatMessage[]
): SessionConversationHistoryMessage[] {
  return buildConversationRestore(messages).history;
}
