import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type, type Static } from "@earendil-works/pi-ai";
import { piStrictToolSampling } from "../../pi-tool-schema";

const READ_CHUNK_SIZE = 12_000;

/** One chapter segment or intermediate note an analysis may read. */
export interface AnalysisInputItem {
  id: string;
  label: string;
  text: string;
  range: string;
}

export function textToolResult<Details>(
  text: string,
  details: Details
): AgentToolResult<Details> {
  return { content: [{ type: "text", text }], details };
}

export function defineStrictTool<
  T extends ReturnType<typeof Type.Object>,
  Details
>(definition: {
  name: string;
  label: string;
  description: string;
  parameters: T;
  execute: (
    toolCallId: string,
    params: Static<T>
  ) => Promise<AgentToolResult<Details>>;
}): AgentTool<T, Details> {
  return {
    ...definition,
    ...piStrictToolSampling(definition.parameters)
  };
}

function chunks(text: string): string[] {
  const output: string[] = [];
  for (let index = 0; index < text.length; index += READ_CHUNK_SIZE) {
    output.push(text.slice(index, index + READ_CHUNK_SIZE));
  }
  return output;
}

const NO_DETAILS = { kind: "none" } as const;

/** Read-only list/read/search tools over the inputs of one analysis unit. */
export function buildAnalysisInputTools(
  items: readonly AnalysisInputItem[]
): AgentTool[] {
  const list = defineStrictTool({
    name: "list_analysis_inputs",
    label: "列出拆书输入",
    description: "列出当前批次的章节片段或上轮分析笔记。",
    parameters: Type.Object({}),
    execute: async () =>
      textToolResult(
        items
          .map((item, index) => {
            const itemChunks = chunks(item.text);
            return `${index + 1}. id=${item.id}\n标题：${item.label}\n范围：${item.range}\n字符：${item.text.length}\n分块：${itemChunks.length}`;
          })
          .join("\n\n"),
        NO_DETAILS
      )
  });
  const read = defineStrictTool({
    name: "read_analysis_input",
    label: "读取拆书输入",
    description:
      "读取指定章节片段或分析笔记；内容较长时使用从 1 开始的 chunk_index 分块读取。",
    parameters: Type.Object({
      input_id: Type.String({ minLength: 1, maxLength: 120 }),
      chunk_index: Type.Optional(Type.Integer({ minimum: 1 }))
    }),
    execute: async (_toolCallId, params) => {
      const item = items.find((candidate) => candidate.id === params.input_id);
      if (!item)
        return textToolResult(`未找到拆书输入：${params.input_id}`, NO_DETAILS);
      const itemChunks = chunks(item.text);
      const chunkIndex = Number(params.chunk_index ?? 1);
      const content = itemChunks[chunkIndex - 1];
      if (content === undefined) {
        return textToolResult(
          `${item.label} 没有第 ${chunkIndex} 个分块。`,
          NO_DETAILS
        );
      }
      return textToolResult(
        `【${item.label}｜${item.range}｜第 ${chunkIndex}/${itemChunks.length} 块】\n\n${content}`,
        NO_DETAILS
      );
    }
  });
  const search = defineStrictTool({
    name: "search_analysis_inputs",
    label: "搜索拆书输入",
    description: "在当前批次的章节片段或分析笔记中搜索关键词。",
    parameters: Type.Object({
      query: Type.String({ minLength: 1, maxLength: 300 }),
      max_results: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 }))
    }),
    execute: async (_toolCallId, params) => {
      const query = params.query.trim();
      const needle = query.toLocaleLowerCase();
      const maximum = Number(params.max_results ?? 8);
      const matches: string[] = [];
      for (const item of items) {
        const haystack = item.text.toLocaleLowerCase();
        let cursor = 0;
        while (matches.length < maximum) {
          const found = haystack.indexOf(needle, cursor);
          if (found < 0) break;
          const start = Math.max(0, found - 120);
          const end = Math.min(item.text.length, found + query.length + 180);
          matches.push(
            `【${item.label}】\n${start > 0 ? "…" : ""}${item.text.slice(start, end)}${end < item.text.length ? "…" : ""}`
          );
          cursor = found + Math.max(1, query.length);
        }
        if (matches.length >= maximum) break;
      }
      return textToolResult(
        matches.length ? matches.join("\n\n---\n\n") : `未找到：${query}`,
        NO_DETAILS
      );
    }
  });
  return [list, read, search];
}
