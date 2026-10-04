import {
  SUBAGENT_DRAW_QUESTION_ID,
  type AgentUserInputAnswer,
  type AgentUserInputDraw,
  type AgentUserInputDrawCandidate
} from "@deepwrite/contracts/renderer";
import type { ChatMessage } from "../types/conversation";

/** Candidates keep their draw position, as on the task's run cards. */
export function drawCandidateNumber(
  candidate: Pick<AgentUserInputDrawCandidate, "index">
): number {
  return candidate.index + 1;
}

export function drawCandidateLength(text: string): number {
  return [...text].length;
}

/** The answer a draw selection sends: one option id and an optional note. */
export function drawSelectionAnswers(
  optionId: string,
  note: string
): AgentUserInputAnswer[] {
  const text = note.trim();
  return [
    {
      id: SUBAGENT_DRAW_QUESTION_ID,
      selectedOptionIds: [optionId],
      ...(text ? { text } : {})
    }
  ];
}

/** Other draw-mode tasks whose candidates also wait for a choice. */
export function otherPendingDrawCount(
  messages: readonly ChatMessage[],
  current: Pick<AgentUserInputDraw, "parentToolCallId" | "taskKey">
): number {
  return messages
    .flatMap((message) => message.subagentDraws ?? [])
    .filter(
      (draw) =>
        draw.phase === "selecting" &&
        !(
          draw.parentToolCallId === current.parentToolCallId &&
          draw.batchTask?.key === current.taskKey
        )
    ).length;
}
