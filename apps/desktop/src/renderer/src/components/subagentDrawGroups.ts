import {
  subagentRunDetailId,
  subagentTaskKey,
  type AgentSubagentBatchTask,
  type AgentSubagentDraw,
  type AgentSubagentRun,
  type AgentSubagentRunStatus
} from "../types/conversation";

/** The candidates and evaluator of one draw-mode task, shown as one card. */
export interface SubagentDrawGroup {
  key: string;
  parentToolCallId: string;
  batchTask?: AgentSubagentBatchTask;
  name: string;
  task: string;
  count: number;
  candidates: AgentSubagentRun[];
  evaluator?: AgentSubagentRun;
  state?: AgentSubagentDraw;
}

export type SubagentRunListEntry =
  | { kind: "run"; key: string; run: AgentSubagentRun }
  | { kind: "draw"; key: string; group: SubagentDrawGroup };

/** Keeps the call's task order; a draw group sits where its first run was. */
export function subagentRunListEntries(
  runs: readonly AgentSubagentRun[],
  draws: readonly AgentSubagentDraw[] | undefined
): SubagentRunListEntry[] {
  const entries: SubagentRunListEntry[] = [];
  const groups = new Map<string, SubagentDrawGroup>();
  for (const run of runs) {
    if (!run.draw) {
      entries.push({ kind: "run", key: subagentRunDetailId(run), run });
      continue;
    }
    const key = subagentTaskKey(run.parentToolCallId, run.batchTask);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        parentToolCallId: run.parentToolCallId,
        ...(run.batchTask ? { batchTask: run.batchTask } : {}),
        name: run.name,
        task: run.task,
        count: run.draw.count,
        candidates: []
      };
      groups.set(key, group);
      entries.push({ kind: "draw", key: `draw:${key}`, group });
    }
    if (run.draw.role === "evaluator") {
      group.evaluator = run;
    } else {
      group.candidates.push(run);
      // The evaluator's run carries its own name and a generated task.
      group.name = run.name;
      group.task = run.task;
    }
  }
  for (const group of groups.values()) {
    group.candidates.sort(
      (left, right) => drawPosition(left) - drawPosition(right)
    );
    const state = draws?.find((draw) => draw.key === group.key);
    if (state) group.state = state;
  }
  return entries;
}

function drawPosition(run: AgentSubagentRun): number {
  return run.draw?.role === "candidate" ? run.draw.index : Infinity;
}

export function finishedDrawCount(group: SubagentDrawGroup): number {
  return group.candidates.filter(
    (run) => run.status !== "running" && run.status !== "queued"
  ).length;
}

/** Card status of a draw group, using the ordinary run status classes. */
export function subagentDrawGroupStatus(
  group: SubagentDrawGroup
): AgentSubagentRunStatus {
  const phase = group.state?.phase;
  if (phase === "selected") return "completed";
  if (phase === "rejected" || phase === "failed") {
    return group.candidates.every((run) => run.status === "stopped")
      ? "stopped"
      : "error";
  }
  if (phase) return "running";
  if (group.candidates.some((run) => run.status === "running")) {
    return "running";
  }
  return group.candidates.length > 0 &&
    group.candidates.every((run) => run.status === "stopped")
    ? "stopped"
    : "running";
}

export function subagentDrawGroupTokens(group: SubagentDrawGroup): number {
  return [...group.candidates, ...(group.evaluator ? [group.evaluator] : [])]
    .map((run) => run.usage?.totalTokens ?? 0)
    .reduce((sum, tokens) => sum + tokens, 0);
}
