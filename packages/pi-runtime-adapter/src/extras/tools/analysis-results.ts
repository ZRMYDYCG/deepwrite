import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import {
  LONG_BOOK_ANALYSIS_MAX_NOTE_CHARACTERS,
  LONG_BOOK_ANALYSIS_MAX_RESULT_CHARACTERS,
  LongBookAnalysisNoteWriteSchema,
  LongBookAnalysisResultSchema
} from "@deepwrite/contracts";
import { extrasOutputResult, type ExtrasOutputTarget } from "../output";
import { defineStrictTool } from "./analysis-inputs";

export interface AnalysisResultToolOptions {
  target: ExtrasOutputTarget;
  /** Set for multi-unit analyses so results can be matched to their unit. */
  unitId?: string;
  label: string;
  description: string;
  completionMessage: string;
  /** Rejects a second submission within the same run. */
  singleSubmission: boolean;
}

/** Submits a named Markdown result to the preview; never writes a library. */
export function buildAnalysisResultTool(
  options: AnalysisResultToolOptions
): AgentTool {
  let written = false;
  return defineStrictTool({
    name: "write_analysis_result",
    label: options.label,
    description: options.description,
    parameters: Type.Object({
      name: Type.String({
        minLength: 1,
        maxLength: 256,
        description: "素材或技能名称，同时作为资料库条目标题。"
      }),
      description: Type.String({
        minLength: 1,
        maxLength: 1_000,
        description: "简要说明用途、适用场景和何时使用。"
      }),
      content: Type.String({
        minLength: 1,
        maxLength: LONG_BOOK_ANALYSIS_MAX_RESULT_CHARACTERS
      })
    }),
    execute: async (_toolCallId, params) => {
      if (options.singleSubmission && written)
        throw new Error("本次分析只能提交一份结果。");
      const result = LongBookAnalysisResultSchema.parse(params);
      written = true;
      return extrasOutputResult(options.target, options.completionMessage, {
        kind: "book-analysis-result",
        ...(options.unitId ? { unitId: options.unitId } : {}),
        result
      });
    }
  });
}

/** Records the structured intermediate note of a batch or reduce unit. */
export function buildAnalysisNoteTool(
  target: ExtrasOutputTarget,
  unitId: string
): AgentTool {
  return defineStrictTool({
    name: "write_analysis_note",
    label: "写入拆书中间笔记",
    description:
      "写入当前批次或归并阶段的结构化中间笔记。必须压缩、去重并保留章节范围证据。",
    parameters: Type.Object({
      text: Type.String({ maxLength: LONG_BOOK_ANALYSIS_MAX_NOTE_CHARACTERS })
    }),
    execute: async (_toolCallId, params) => {
      const note = LongBookAnalysisNoteWriteSchema.parse(params);
      return extrasOutputResult(target, "已记录当前拆书阶段的中间笔记。", {
        kind: "book-analysis-note",
        unitId,
        note
      });
    }
  });
}
