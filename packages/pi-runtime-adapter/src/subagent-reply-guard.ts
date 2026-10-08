import type { Agent } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { readAssistantText } from "./subagent-helpers";

/** Continuations after replies cut at the model's output limit. */
export const SUBAGENT_CUT_RECOVERIES = 2;
const CUT_NOTICE =
  "上一条回复超过了模型单次输出上限，被截断：其中的工具调用没有执行，内容没有保存。请把提交拆成更小的批次，每次只交一部分条目或单元，按任务给出的每批上限分几次提交；思考保持简短，不要在思考里预写全部成品，直接开始调用工具。";
const EMPTY_NOTICE =
  "上一条回复是空的：没有调用工具，也没有交接文字。请继续完成任务；已经全部完成的话，用一两句话写出交接摘要。";

export type SubagentReplyVerdict = "continue" | "cut-off" | "final";

/**
 * Replies that would end a child without a result get a second chance
 * instead of a misleading failure. A reply cut at the output limit saves
 * nothing, and asking for the same output again only repeats the cut, so
 * the child is told to send less per call; an empty reply gets one nudge.
 * Once the allowance is spent the run ends and says why.
 */
export function createSubagentReplyGuard(child: Agent) {
  let cuts = 0;
  let nudged = false;
  const steer = (text: string) =>
    child.steer({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now()
    });
  return {
    /** `delivered`: a terminating tool already handed the result over. */
    inspect(
      message: AssistantMessage,
      delivered: boolean
    ): SubagentReplyVerdict {
      if (message.stopReason === "length") {
        if (cuts >= SUBAGENT_CUT_RECOVERIES) return "cut-off";
        cuts++;
        steer(CUT_NOTICE);
        return "continue";
      }
      if (
        !nudged &&
        !delivered &&
        !message.content.some(({ type }) => type === "toolCall") &&
        !readAssistantText(message).trim()
      ) {
        nudged = true;
        steer(EMPTY_NOTICE);
        return "continue";
      }
      return "final";
    },
    cutOffMessage: () =>
      `子智能体的回复连续 ${cuts + 1} 次超过模型单次输出上限被截断，没有保存任何内容。请调低思考强度、换用单次输出上限更大的模型，或把任务拆小后重试。`
  };
}
