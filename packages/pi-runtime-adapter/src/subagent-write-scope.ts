import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { SubagentWriteScope } from "./subagent-types";

/** `write_scope` entry granting directory changes to one task at a time. */
export const SUBAGENT_STRUCTURE_SCOPE = "structure";

const WORKSPACE_WRITE_TOOLS = new Set([
  "create",
  "edit",
  "delete",
  "propose_continuity_commit"
]);

export function isWorkspaceWriteTool(name: string): boolean {
  return WORKSPACE_WRITE_TOOLS.has(name);
}

/** Serializes write tool calls of children that run at the same time. */
export interface SubagentWriteLock {
  run<T>(
    signal: AbortSignal | undefined,
    operation: () => Promise<T>
  ): Promise<T>;
}

function waitUnlessAborted(
  previous: Promise<void>,
  signal: AbortSignal | undefined
): Promise<void> {
  if (!signal) return previous;
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = (): void => reject(new Error("子智能体运行已中止。"));
    signal.addEventListener("abort", abort, { once: true });
    void previous.then(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    });
  });
}

export function createSubagentWriteLock(): SubagentWriteLock {
  let tail: Promise<void> = Promise.resolve();
  return {
    run(signal, operation) {
      const previous = tail;
      let release!: () => void;
      const done = new Promise<void>((resolve) => {
        release = resolve;
      });
      // A waiter that gives up still keeps its slot behind `previous`.
      tail = previous.then(() => done);
      return (async () => {
        try {
          await waitUnlessAborted(previous, signal);
          return await operation();
        } finally {
          release();
        }
      })();
    }
  };
}

export function parseSubagentWriteScope(
  entries: readonly string[] | undefined
): SubagentWriteScope {
  const ids = new Set(
    (entries ?? []).map((entry) => entry.trim()).filter(Boolean)
  );
  if (ids.has(SUBAGENT_STRUCTURE_SCOPE)) return { kind: "structure" };
  return ids.size > 0 ? { kind: "objects", ids } : { kind: "read-only" };
}

export function writeScopesConflict(
  left: SubagentWriteScope | undefined,
  right: SubagentWriteScope | undefined
): boolean {
  if (!left || !right) return false;
  if (left.kind === "exclusive" || right.kind === "exclusive") return true;
  if (left.kind === "read-only" || right.kind === "read-only") return false;
  if (left.kind === "structure" || right.kind === "structure") return true;
  for (const id of left.ids) {
    if (right.ids.has(id)) return true;
  }
  return false;
}

function stringArg(args: unknown, name: string): string | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const value = (args as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * The object a write call changes, or `undefined` for directory changes.
 * A chapter-scoped character file belongs to its chapter.
 */
function writeTarget(toolName: string, args: unknown): string | undefined {
  if (toolName === "edit") {
    return stringArg(args, "chapter_id") ?? stringArg(args, "id");
  }
  if (toolName === "delete" && stringArg(args, "document")) {
    return stringArg(args, "chapter_id") ?? stringArg(args, "id");
  }
  return undefined;
}

function assertWithinScope(
  scope: Extract<SubagentWriteScope, { kind: "objects" }>,
  toolName: string,
  args: unknown
): void {
  const target = writeTarget(toolName, args);
  if (target === undefined) {
    throw new Error(
      `${toolName} 会改动目录结构或连续性账本，本任务的写入范围没有声明 ${SUBAGENT_STRUCTURE_SCOPE}，不能执行。请只修改写入范围内的对象，或在交接摘要中说明需要主智能体处理。`
    );
  }
  if (!scope.ids.has(target)) {
    throw new Error(
      `对象 ${target} 不在本任务的写入范围（${[...scope.ids].join("、")}）内，不能修改。其他子智能体可能正在修改它；请在交接摘要中说明需要主智能体处理。`
    );
  }
}

/**
 * Applies a parallel task's write scope to its tools. Read-only tasks lose
 * every write tool; other write calls are checked and serialized.
 */
export function applySubagentWriteScope(
  tools: AgentTool[],
  scope: SubagentWriteScope | undefined,
  lock: SubagentWriteLock
): AgentTool[] {
  if (!scope || scope.kind === "exclusive") return tools;
  if (scope.kind === "read-only") {
    return tools.filter((tool) => !isWorkspaceWriteTool(tool.name));
  }
  return tools.map((tool) =>
    isWorkspaceWriteTool(tool.name)
      ? {
          ...tool,
          execute: async (toolCallId, args, signal, onUpdate) => {
            if (scope.kind === "objects") {
              assertWithinScope(scope, tool.name, args);
            }
            return lock.run(signal, () =>
              tool.execute(toolCallId, args, signal, onUpdate)
            );
          }
        }
      : tool
  );
}

/** Runtime fact appended to a parallel child's system prompt. */
export function subagentWriteScopeNote(
  scope: SubagentWriteScope | undefined
): string | undefined {
  if (!scope || scope.kind === "exclusive") return undefined;
  if (scope.kind === "read-only") {
    return "本任务是只读任务：没有写入工具，只能读取，并在交接摘要中给出结论或建议。";
  }
  if (scope.kind === "structure") {
    return "本任务持有目录结构写入权：可以新增、删除和修改对象，运行期间没有其他写入任务同时进行。";
  }
  return [
    `本任务的写入范围：${[...scope.ids].join("、")}。`,
    "只能修改这些对象；长篇章节 id 覆盖该章全部文档，包括该章的人物状态与历史。",
    "不能新增或删除对象，也不能提交连续性记录。其他子智能体可能正同时修改范围外的对象。"
  ].join("");
}
