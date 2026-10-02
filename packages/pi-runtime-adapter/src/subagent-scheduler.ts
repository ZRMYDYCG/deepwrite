import type {
  SubagentTaskOutcome,
  SubagentTaskRequest
} from "./subagent-types";
import { writeScopesConflict } from "./subagent-write-scope";

/** Summary of a finished dependency, handed to the task that waited for it. */
export interface SubagentHandoff {
  key: string;
  name: string;
  summary: string;
}

export interface RunSubagentTasksOptions {
  tasks: readonly SubagentTaskRequest[];
  maxConcurrency: number;
  signal?: AbortSignal;
  runTask(
    request: SubagentTaskRequest,
    handoffs: readonly SubagentHandoff[]
  ): Promise<SubagentTaskOutcome>;
  /** Reports a task that will never start (`skipped` or `aborted`). */
  settleUnstarted(
    request: SubagentTaskRequest,
    outcome: SubagentTaskOutcome
  ): void;
}

function failedExplicitDependency(
  request: SubagentTaskRequest,
  outcomes: ReadonlyMap<string, SubagentTaskOutcome>
): string | undefined {
  return request.dependsOn.find(
    (key) =>
      !request.implicitDependsOn.includes(key) &&
      outcomes.has(key) &&
      outcomes.get(key)!.status !== "completed"
  );
}

/**
 * Runs a validated task list. A task starts when every dependency finished,
 * fewer than `maxConcurrency` tasks run, and no running task overlaps its
 * write scope. Only explicit dependencies propagate failure; ordering added
 * for overlapping scopes waits for any terminal status.
 */
export async function runSubagentTasks(
  options: RunSubagentTasksOptions
): Promise<Map<string, SubagentTaskOutcome>> {
  const { tasks, maxConcurrency, signal } = options;
  const byKey = new Map(tasks.map((task) => [task.key, task]));
  const outcomes = new Map<string, SubagentTaskOutcome>();
  const pending = [...tasks];
  const running = new Map<string, Promise<void>>();

  const settle = (
    request: SubagentTaskRequest,
    outcome: SubagentTaskOutcome
  ): void => {
    pending.splice(pending.indexOf(request), 1);
    outcomes.set(request.key, outcome);
    options.settleUnstarted(request, outcome);
  };

  const start = (request: SubagentTaskRequest): void => {
    pending.splice(pending.indexOf(request), 1);
    const handoffs = request.dependsOn.flatMap((key) => {
      const outcome = outcomes.get(key);
      return outcome?.status === "completed"
        ? [
            {
              key,
              name: byKey.get(key)!.definition.name,
              summary: outcome.summary
            }
          ]
        : [];
    });
    const finished = options
      .runTask(request, handoffs)
      .catch((error: unknown): SubagentTaskOutcome => ({
        status: signal?.aborted ? "aborted" : "error",
        summary: `子智能体执行失败：${error instanceof Error ? error.message : String(error)}`
      }))
      .then((outcome) => {
        outcomes.set(request.key, outcome);
        running.delete(request.key);
      });
    running.set(request.key, finished);
  };

  /** One scheduling decision; false when the task must keep waiting. */
  const advance = (request: SubagentTaskRequest): boolean => {
    if (signal?.aborted) {
      settle(request, {
        status: "aborted",
        summary: "主智能体运行已中止，该子任务未启动。"
      });
      return true;
    }
    const failed = failedExplicitDependency(request, outcomes);
    if (failed) {
      settle(request, {
        status: "skipped",
        summary: `前置任务 ${failed} 没有完成，该子任务已跳过。`
      });
      return true;
    }
    if (!request.dependsOn.every((key) => outcomes.has(key))) return false;
    if (running.size >= maxConcurrency) return false;
    const overlapsRunning = [...running.keys()].some((key) =>
      writeScopesConflict(byKey.get(key)!.writeScope, request.writeScope)
    );
    if (overlapsRunning) return false;
    start(request);
    return true;
  };

  while (pending.length > 0 || running.size > 0) {
    // Repeat until stable: a skip can unblock a task listed before it.
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const request of [...pending]) {
        if (advance(request)) progressed = true;
      }
    }
    if (running.size > 0) {
      await Promise.race(running.values());
    } else if (pending.length > 0) {
      // Validation rejects cycles; this only guards against a stuck loop.
      for (const request of [...pending]) {
        settle(request, {
          status: "skipped",
          summary: "依赖关系无法满足，该子任务已跳过。"
        });
      }
    }
  }
  return outcomes;
}
