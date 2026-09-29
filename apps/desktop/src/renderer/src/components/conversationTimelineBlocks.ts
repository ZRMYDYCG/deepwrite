import type { LongWorkspaceProposalItem } from "../composables/useLongWorkspaceProposals";
import type { ChatMessage } from "../types/conversation";
import {
  processingDisplayItems,
  processingLabel,
  type ProcessingDisplayItem
} from "./conversationToolPresentation";

type ProcessingContentItem = Exclude<
  ProcessingDisplayItem,
  { type: "compaction" }
>;

export type ConversationTimelineBlock =
  | {
      id: string;
      kind: "processing";
      items: ProcessingContentItem[];
      startedAt: string;
      endedAt?: string;
      live: boolean;
    }
  | {
      id: string;
      kind: "response";
      item: Extract<ProcessingDisplayItem, { type: "response" }>;
      live: boolean;
    }
  | {
      id: string;
      kind: "compaction";
      item: Extract<ProcessingDisplayItem, { type: "compaction" }>;
    };

/** A response or compaction ends the current processed section. */
export function conversationTimelineBlocks(
  message: ChatMessage,
  longProposalItems: readonly LongWorkspaceProposalItem[] = []
): ConversationTimelineBlock[] {
  const items = processingDisplayItems(
    message,
    message.status === "streaming",
    longProposalItems
  );
  if (!items.some((item) => item.type === "compaction")) {
    return items.length ||
      (message.status === "streaming" &&
        (message.retry || message.processingStartedAt))
      ? [
          {
            id: `processing:${message.id}`,
            kind: "processing",
            items: items.filter(
              (item): item is ProcessingContentItem =>
                item.type !== "compaction"
            ),
            startedAt: message.processingStartedAt ?? message.createdAt,
            ...(message.processingCompletedAt
              ? { endedAt: message.processingCompletedAt }
              : {}),
            live: message.status === "streaming"
          }
        ]
      : [];
  }
  const blocks: ConversationTimelineBlock[] = [];
  let section: ProcessingContentItem[] = [];
  let sectionStart = message.processingStartedAt ?? message.createdAt;

  function closeSection(endedAt?: string): void {
    if (!section.length && !(endedAt && blocks.length === 0)) return;
    const first = section[0];
    blocks.push({
      id: `processing:${first?.id ?? endedAt ?? message.id}`,
      kind: "processing",
      items: section,
      startedAt: sectionStart,
      ...(endedAt ? { endedAt } : {}),
      live: !endedAt && message.status === "streaming"
    });
    section = [];
  }

  for (const item of items) {
    if (item.type === "compaction") {
      closeSection(item.createdAt);
      blocks.push({ id: item.id, kind: "compaction", item });
      sectionStart = item.compaction.completedAt ?? item.createdAt;
    } else if (item.type === "response") {
      closeSection(item.createdAt);
      blocks.push({
        id: item.id,
        kind: "response",
        item,
        live: message.status === "streaming"
      });
      sectionStart = item.createdAt;
    } else {
      section.push(item);
    }
  }
  closeSection();
  if (!blocks.length && message.status === "streaming") {
    blocks.push({
      id: `processing:${message.id}`,
      kind: "processing",
      items: [],
      startedAt: sectionStart,
      live: true
    });
  }
  // Earlier output is settled once a later event has started.
  for (const block of blocks.slice(0, -1)) {
    if (block.kind === "response") block.live = false;
  }
  return blocks;
}

export function timelineProcessingLabel(
  message: ChatMessage,
  block: Extract<ConversationTimelineBlock, { kind: "processing" }>,
  now: number
): string {
  if (block.id === `processing:${message.id}`)
    return processingLabel(message, now);
  const segmentMessage: ChatMessage = {
    ...message,
    status: block.live ? "streaming" : "completed",
    processingStartedAt: block.startedAt
  };
  if (block.live) delete segmentMessage.processingCompletedAt;
  else {
    if (block.endedAt) segmentMessage.processingCompletedAt = block.endedAt;
    delete segmentMessage.retry;
  }
  return processingLabel(segmentMessage, now);
}
