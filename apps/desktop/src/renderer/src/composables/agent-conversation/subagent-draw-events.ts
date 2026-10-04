import {
  subagentTaskKey,
  type AgentSubagentDraw,
  type ChatMessage
} from "../../types/conversation";
import type { AgentConversationContext } from "./context";
import type { SubagentDrawUpdatedEventEnvelope } from "./types";

/**
 * Keeps the whole-task state of a draw-mode task. Its candidates and the
 * evaluator arrive as ordinary child runs carrying `draw`; this only records
 * where the selection stands and what was picked.
 */
export function handleSubagentDrawUpdated(
  ctx: Pick<AgentConversationContext, "ensureSubagentMessage">,
  event: SubagentDrawUpdatedEventEnvelope
): void {
  const { payload } = event;
  const message = ctx.ensureSubagentMessage(payload.runId, event.timestamp);
  message.processingStartedAt ??= event.timestamp;
  const key = subagentTaskKey(payload.parentToolCallId, payload.batchTask);
  const next: AgentSubagentDraw = {
    key,
    parentToolCallId: payload.parentToolCallId,
    ...(payload.batchTask
      ? {
          batchTask: {
            ...payload.batchTask,
            dependsOn: [...payload.batchTask.dependsOn]
          }
        }
      : {}),
    subagentId: payload.subagentId,
    name: payload.name,
    count: payload.count,
    phase: payload.phase,
    ...(payload.selectedBy ? { selectedBy: payload.selectedBy } : {}),
    ...(payload.selectedIndex !== undefined
      ? { selectedIndex: payload.selectedIndex }
      : {}),
    ...(payload.selectedSubagentRunId
      ? { selectedSubagentRunId: payload.selectedSubagentRunId }
      : {}),
    ...(payload.reason ? { reason: payload.reason } : {}),
    ...(payload.note ? { note: payload.note } : {}),
    updatedAt: event.timestamp
  };
  const draws = (message.subagentDraws ??= []);
  const index = draws.findIndex((draw) => draw.key === key);
  if (index === -1) draws.push(next);
  else draws[index] = next;
}

/** A stopped or failed parent run leaves no selection waiting. */
export function finalizeOpenSubagentDraws(
  message: ChatMessage,
  completedAt: string,
  reason: string
): void {
  for (const draw of message.subagentDraws ?? []) {
    if (draw.phase !== "selecting" && draw.phase !== "evaluating") continue;
    draw.phase = "failed";
    draw.reason = reason;
    draw.updatedAt = completedAt;
  }
}
