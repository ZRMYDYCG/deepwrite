import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type {
  AgentUserInputQuestion,
  ShortWorkspaceStageId
} from "@deepwrite/contracts";
import { askOutsideSubagentWriteLock } from "../subagent-write-lock";
import {
  textResult,
  type BuildWritingWorkspaceToolsInput,
  type ShortWorkspaceToolDetails
} from "./shared";

const CROSS_STAGE_QUESTION_ID = "cross_stage_write";
const CONTINUE_OPTION_ID = "continue_once";

export type WritingPhase = "character" | "plot" | "draft";

export function crossStageMutationPolicyText(
  input: BuildWritingWorkspaceToolsInput
): string {
  return input.autoApproveCrossStageOperations === true
    ? "跨人物、剧情、正文阶段操作已按用户设置自动允许，不会逐笔询问。"
    : "跨人物、剧情、正文阶段操作会逐笔请求用户确认。";
}

export function writingPhaseForStage(
  stageId: ShortWorkspaceStageId
): WritingPhase {
  if (stageId === "character_design") return "character";
  if (stageId === "draft") return "draft";
  return "plot";
}

function phaseLabel(phase: WritingPhase): string {
  if (phase === "character") return "人物";
  if (phase === "draft") return "正文";
  return "剧情";
}

export async function confirmCrossStageMutation(
  input: BuildWritingWorkspaceToolsInput,
  request: {
    toolCallId: string;
    targetStageId: ShortWorkspaceStageId;
    targetTitle: string;
    operationLabel: string;
    signal?: AbortSignal;
  }
): Promise<"continue" | "cancel"> {
  const activePhase = writingPhaseForStage(input.workspace.activeStageId);
  const targetPhase = writingPhaseForStage(request.targetStageId);
  if (activePhase === targetPhase) return "continue";
  if (input.autoApproveCrossStageOperations === true) return "continue";
  if (!input.requestUserInput) {
    throw new Error("当前运行无法向用户请求跨阶段写入确认。");
  }

  const questions: AgentUserInputQuestion[] = [
    {
      id: CROSS_STAGE_QUESTION_ID,
      header: "跨阶段编辑",
      question: `当前处于「${phaseLabel(activePhase)}」阶段，但这次操作将${request.operationLabel}「${phaseLabel(targetPhase)}」阶段中的《${request.targetTitle}》。是否继续生成变更提案？`,
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
  const requestUserInput = input.requestUserInput;
  const response = await askOutsideSubagentWriteLock(
    JSON.stringify(questions),
    () =>
      requestUserInput(
        {
          toolCallId: request.toolCallId,
          source: "cross_stage_write",
          questions
        },
        request.signal
      )
  );
  return response.answers[0]?.selectedOptionIds?.includes(CONTINUE_OPTION_ID)
    ? "continue"
    : "cancel";
}

export function crossStageMutationCancelled(
  input: BuildWritingWorkspaceToolsInput,
  targetStageId: ShortWorkspaceStageId
): AgentToolResult<ShortWorkspaceToolDetails> {
  return textResult(
    `未执行：用户取消了从「${phaseLabel(writingPhaseForStage(input.workspace.activeStageId))}」阶段到「${phaseLabel(writingPhaseForStage(targetStageId))}」阶段的跨阶段操作。`
  );
}
