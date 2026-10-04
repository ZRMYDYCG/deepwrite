import { AsyncLocalStorage } from "node:async_hooks";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";

const WORKSPACE_WRITE_TOOLS = new Set([
  "create",
  "edit",
  "delete",
  "propose_continuity_commit"
]);

export function isWorkspaceWriteTool(name: string): boolean {
  return WORKSPACE_WRITE_TOOLS.has(name);
}

type SerialRunner = <T>(
  signal: AbortSignal | undefined,
  operation: () => Promise<T>
) => Promise<T>;

/**
 * Serializes the write tool calls of children that run at the same time, and
 * remembers which child last changed each object so a refused write can say
 * who got there first.
 */
export interface SubagentWriteLock {
  run: SerialRunner;
  /**
   * Serializes the children's questions to the user on a separate queue: the
   * run shows one question at a time, and waiting for an answer must not
   * hold up the writes.
   */
  ask: SerialRunner;
  /** Object id → label of the child whose write was last accepted. */
  readonly lastWriter: Map<string, string>;
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

function createSerialRunner(): SerialRunner {
  let tail: Promise<void> = Promise.resolve();
  return (signal, operation) => {
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
  };
}

export function createSubagentWriteLock(): SubagentWriteLock {
  return {
    lastWriter: new Map(),
    run: createSerialRunner(),
    ask: createSerialRunner()
  };
}

function stringArg(args: unknown, name: string): string | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const value = (args as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * The object an edit or delete call touches. A chapter-scoped character file
 * belongs to its chapter. Creates and continuity commits name no existing
 * object.
 */
function writeTarget(toolName: string, args: unknown): string | undefined {
  if (toolName !== "edit" && toolName !== "delete") return undefined;
  return stringArg(args, "chapter_id") ?? stringArg(args, "id");
}

/** Whether the call produced a proposal; a refusal reports `kind: "none"`. */
function formedProposal(result: AgentToolResult<unknown>): boolean {
  const kind = (result.details as { kind?: unknown } | undefined)?.kind;
  return typeof kind === "string" && kind !== "none";
}

function conflictNote(target: string, writer: string): string {
  return `提示：${target} 刚被并行子任务 ${writer} 修改，上面的结果可能由此引起。请重新 read 完整读取后，只改动你负责的部分；仍无法完成时，在交接摘要中说明，交给主智能体协调。`;
}

function noteWrittenByOther(
  lock: SubagentWriteLock,
  target: string | undefined,
  writer: string
): string | undefined {
  const other = target ? lock.lastWriter.get(target) : undefined;
  return target && other && other !== writer
    ? conflictNote(target, other)
    : undefined;
}

/** Answers one locked write call already got from the user, by question. */
type LockedWriteAnswers = Map<string, unknown>;

const lockedWrite = new AsyncLocalStorage<LockedWriteAnswers>();

/** Leaves the locked section so the question is asked without the lock. */
class AskOutsideLock {
  constructor(
    readonly question: string,
    readonly ask: () => Promise<unknown>
  ) {}
}

/**
 * Asks the user on behalf of a write tool. Inside a parallel child's locked
 * write, the lock is released first and the call starts over once answered:
 * the other children keep writing meanwhile, and the retried call re-reads
 * everything it checks instead of trusting what it saw before the question.
 */
export async function askOutsideSubagentWriteLock<T>(
  question: string,
  ask: () => Promise<T>
): Promise<T> {
  const answers = lockedWrite.getStore();
  if (!answers) return ask();
  if (answers.has(question)) return answers.get(question) as T;
  throw new AskOutsideLock(question, ask);
}

async function executeLocked(
  tool: AgentTool,
  lock: SubagentWriteLock,
  writer: string,
  ...[toolCallId, args, signal, onUpdate]: Parameters<AgentTool["execute"]>
): Promise<AgentToolResult<unknown> | AskOutsideLock> {
  const target = writeTarget(tool.name, args);
  try {
    const result = await tool.execute(toolCallId, args, signal, onUpdate);
    if (formedProposal(result)) {
      if (target) lock.lastWriter.set(target, writer);
      return result;
    }
    const note = noteWrittenByOther(lock, target, writer);
    return note
      ? {
          ...result,
          content: [...result.content, { type: "text", text: note }]
        }
      : result;
  } catch (error: unknown) {
    if (error instanceof AskOutsideLock) return error;
    const note = noteWrittenByOther(lock, target, writer);
    if (!note || !(error instanceof Error)) throw error;
    throw new Error(`${error.message}\n${note}`, { cause: error });
  }
}

/**
 * Runs the work-changing tools of a parallel child under the shared lock, so
 * each read-check-apply is atomic against the other children. Anything the
 * tools refuse because another child changed the object first is annotated
 * with who did it; the decision itself stays with the tools' own checks.
 * Questions to the user are asked outside the lock.
 */
export function applySubagentWriteLock(
  tools: AgentTool[],
  lock: SubagentWriteLock,
  writer: string
): AgentTool[] {
  return tools.map((tool) =>
    isWorkspaceWriteTool(tool.name)
      ? {
          ...tool,
          execute: async (...call) => {
            const answers: LockedWriteAnswers = new Map();
            for (;;) {
              const outcome = await lock.run(call[2], () =>
                lockedWrite.run(answers, () =>
                  executeLocked(tool, lock, writer, ...call)
                )
              );
              if (!(outcome instanceof AskOutsideLock)) return outcome;
              answers.set(
                outcome.question,
                await lock.ask(call[2], outcome.ask)
              );
            }
          }
        }
      : tool
  );
}

/** Runtime fact appended to the system prompt of a parallel standard child. */
export function subagentParallelNote(): string {
  return "本任务与其他子智能体并行运行，它们可能同时修改作品。只修改任务交给你的对象；写入被拒绝并提示对象刚被其他并行任务修改时，先重新 read 再改，仍无法完成就在交接摘要中说明，不要反复覆盖。";
}
