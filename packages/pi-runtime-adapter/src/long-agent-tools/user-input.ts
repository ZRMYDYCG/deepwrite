import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { AgentUserInputQuestion } from "@deepwrite/contracts";
import { askOutsideSubagentWriteLock } from "../subagent-write-lock";
import { textResult } from "./shared";
import {
  LONG_STAGE_LABELS,
  LONG_STAGE_ROOTS,
  type LongStage
} from "./entity-registry";
import type { LongToolContext } from "./context";
import type { LongAgentToolDetails } from "./index";

const CROSS_STAGE_QUESTION_ID = "cross_stage_write";
const CONTINUE_OPTION_ID = "continue_once";

function activeStageLabel(ctx: LongToolContext): string {
  const stage = (Object.keys(LONG_STAGE_ROOTS) as LongStage[]).find(
    (candidate) => LONG_STAGE_ROOTS[candidate] === ctx.workspace.activeRoot
  );
  return stage ? LONG_STAGE_LABELS[stage] : ctx.workspace.activeRoot;
}

export async function confirmCrossStageWrite(
  ctx: LongToolContext,
  input: {
    toolCallId: string;
    targetStage: LongStage;
    targetTitle: string;
    operationLabel: string;
    signal: AbortSignal | undefined;
  }
): Promise<"continue" | "cancel"> {
  if (LONG_STAGE_ROOTS[input.targetStage] === ctx.workspace.activeRoot) {
    return "continue";
  }
  if (ctx.input.autoApproveCrossStageOperations === true) {
    return "continue";
  }
  if (!ctx.input.requestUserInput) {
    throw new Error("当前运行无法向用户请求跨阶段写入确认。");
  }

  const questions: AgentUserInputQuestion[] = [
    {
      id: CROSS_STAGE_QUESTION_ID,
      header: "跨阶段编辑",
      question: `当前处于「${activeStageLabel(ctx)}」阶段，但这次操作将${input.operationLabel}「${LONG_STAGE_LABELS[input.targetStage]}」阶段中的《${input.targetTitle}》。是否继续生成变更提案？`,
      options: [
        {
          id: CONTINUE_OPTION_ID,
          label: "允许本次操作",
          description: "仅允许当前这一笔跨阶段变更，后续操作仍会再次确认。"
        },
        {
          id: "cancel",
          label: "取消这次操作",
          description: "不生成变更提案，智能体会根据结果继续处理。"
        }
      ]
    }
  ];
  const requestUserInput = ctx.input.requestUserInput;
  const response = await askOutsideSubagentWriteLock(
    JSON.stringify(questions),
    () =>
      requestUserInput(
        {
          toolCallId: input.toolCallId,
          source: "cross_stage_write",
          questions
        },
        input.signal
      )
  );
  return response.answers[0]?.selectedOptionIds?.includes(CONTINUE_OPTION_ID)
    ? "continue"
    : "cancel";
}

export function crossStageWriteCancelled(
  ctx: LongToolContext,
  targetStage: LongStage
): AgentToolResult<LongAgentToolDetails> {
  return textResult(
    `未执行：用户取消了从「${activeStageLabel(ctx)}」阶段到「${LONG_STAGE_LABELS[targetStage]}」阶段的跨阶段操作。`
  );
}
