import type { LongWorkspaceProposalItem } from "../composables/useLongWorkspaceProposals";
import type { ChatMessage } from "../types/conversation";
import {
  processingDisplayItems,
  type ProcessingDisplayItem
} from "./conversationToolPresentation";

export interface ConversationTimelineBlock {
  id: string;
  kind: "processing";
  items: ProcessingDisplayItem[];
  startedAt: string;
  endedAt?: string;
  live: boolean;
}

/** One run has one processing summary, including every response and compaction. */
export function conversationTimelineBlocks(
  message: ChatMessage,
  longProposalItems: readonly LongWorkspaceProposalItem[] = []
): ConversationTimelineBlock[] {
  const items = processingDisplayItems(
    message,
    message.status === "streaming",
    longProposalItems
  );
  if (
    !items.length &&
    !(
      message.status === "streaming" &&
      (message.retry || message.processingStartedAt)
    )
  ) {
    return [];
  }
  return [
    {
      id: `processing:${message.id}`,
      kind: "processing",
      items,
      startedAt: message.processingStartedAt ?? message.createdAt,
      ...(message.processingCompletedAt
        ? { endedAt: message.processingCompletedAt }
        : {}),
      live: message.status === "streaming"
    }
  ];
}
