import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Static, TSchema } from "@earendil-works/pi-ai";
import { piStrictToolSampling } from "../../pi-tool-schema";
type ReadOnlyDetails = { kind: "none" };

export function textResult(text: string): AgentToolResult<ReadOnlyDetails> {
  return { content: [{ type: "text", text }], details: { kind: "none" } };
}

export function jsonResult(value: unknown): AgentToolResult<ReadOnlyDetails> {
  return textResult(JSON.stringify(value, null, 2));
}

export function defineTool<T extends TSchema>(definition: {
  name: string;
  label: string;
  description: string;
  parameters: T;
  execute: (
    toolCallId: string,
    params: Static<T>,
    signal?: AbortSignal
  ) => Promise<AgentToolResult<ReadOnlyDetails>>;
}): AgentTool<T, ReadOnlyDetails> {
  return {
    ...definition,
    ...piStrictToolSampling(definition.parameters)
  };
}

export function normalizedQuery(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

export function page<Value>(
  values: readonly Value[],
  cursor: unknown,
  limit: unknown
) {
  const offset = Math.max(0, Number.parseInt(String(cursor ?? "0"), 10) || 0);
  const size = Math.min(100, Math.max(1, Number(limit ?? 30)));
  return {
    items: values.slice(offset, offset + size),
    next_cursor: offset + size < values.length ? String(offset + size) : null,
    total: values.length
  };
}
