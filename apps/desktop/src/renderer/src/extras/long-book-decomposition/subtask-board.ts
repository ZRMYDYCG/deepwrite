import { decompositionTaskUnitIds } from "@deepwrite/contracts/renderer";
import {
  subagentRunDetailId,
  type AgentSubagentRun
} from "../../types/conversation";
import type {
  SubagentParentActivity,
  TrackedSubagentPackage
} from "../agent-runtime/subagentRunTracker";

export type SubtaskGroup = "running" | "queued" | "unassigned" | "finished";
export type SubtaskFilter = "all" | SubtaskGroup;
export const SUBTASK_GROUPS: readonly SubtaskGroup[] = [
  "running",
  "queued",
  "unassigned",
  "finished"
];

export interface SubtaskRow {
  /** Stable from the queued card to the finished run. */
  key: string;
  group: SubtaskGroup;
  /** Absent for a unit the lead agent has not delegated yet. */
  run?: AgentSubagentRun;
  unitIds: string[];
  /** Tasks of the same call that must finish first. */
  waitingFor: string[];
  /** Place in line for a free parallel slot, when nothing else blocks it. */
  slotPosition?: number;
}

const FINISHED = new Set<AgentSubagentRun["status"]>([
  "completed",
  "error",
  "stopped",
  "skipped"
]);

function groupOf(run: AgentSubagentRun): SubtaskGroup {
  if (run.status === "running") return "running";
  return run.status === "queued" ? "queued" : "finished";
}

const startedTime = (run: AgentSubagentRun) => Date.parse(run.startedAt) || 0;
const finishedTime = (run: AgentSubagentRun) =>
  Date.parse(run.completedAt ?? run.startedAt) || 0;

/**
 * Children in display order, plus the units of an unfinished package that no
 * child has been given yet. Queued children keep the order the lead planned.
 */
export function buildSubtaskRows(pkg: TrackedSubagentPackage): SubtaskRow[] {
  const runs = pkg.message.subagentRuns ?? [];
  const taskId = (run: AgentSubagentRun, key: string) =>
    `${run.parentToolCallId}:${key}`;
  const finishedKeys = new Set(
    runs.flatMap((run) =>
      FINISHED.has(run.status) && run.batchTask
        ? [taskId(run, run.batchTask.key)]
        : []
    )
  );
  const assigned = new Set<string>();
  const rows: SubtaskRow[] = runs.map((run) => {
    const unitIds = decompositionTaskUnitIds(run.task, pkg.unitIds);
    unitIds.forEach((id) => assigned.add(id));
    return {
      key: subagentRunDetailId(run),
      group: groupOf(run),
      run,
      unitIds,
      waitingFor:
        run.status === "queued"
          ? (run.batchTask?.dependsOn ?? []).filter(
              (key) => !finishedKeys.has(taskId(run, key))
            )
          : []
    };
  });
  const byGroup = (group: SubtaskGroup) =>
    rows.filter((row) => row.group === group);
  byGroup("queued")
    .filter((row) => !row.waitingFor.length)
    .sort((a, b) => a.run!.batchTask!.index - b.run!.batchTask!.index)
    .forEach((row, index) => (row.slotPosition = index + 1));
  const unassigned: SubtaskRow[] = pkg.endedAt
    ? []
    : pkg.unitIds
        .filter((id) => !assigned.has(id))
        .map((id) => ({
          key: `unit:${id}`,
          group: "unassigned" as const,
          unitIds: [id],
          waitingFor: []
        }));
  return [
    ...byGroup("running").sort(
      (a, b) => startedTime(a.run!) - startedTime(b.run!)
    ),
    ...byGroup("queued").sort(
      (a, b) => (a.run!.batchTask?.index ?? 0) - (b.run!.batchTask?.index ?? 0)
    ),
    ...unassigned,
    ...byGroup("finished").sort(
      (a, b) => finishedTime(b.run!) - finishedTime(a.run!)
    )
  ];
}

export function subtaskCounts(
  rows: readonly SubtaskRow[]
): Record<SubtaskFilter, number> {
  const counts: Record<SubtaskFilter, number> = {
    all: rows.length,
    running: 0,
    queued: 0,
    unassigned: 0,
    finished: 0
  };
  for (const row of rows) counts[row.group]++;
  return counts;
}

export type SubtaskAction =
  | { kind: "starting" | "thinking" | "replying" | "retry" }
  | { kind: "tool"; toolName: string };

/** What a running child is doing now, from the tail of its own steps. */
export function subtaskAction(run: AgentSubagentRun): SubtaskAction {
  if (run.retry) return { kind: "retry" };
  const tool = [...run.toolCalls]
    .reverse()
    .find(({ status }) => status === "running" || status === "preparing");
  if (tool) return { kind: "tool", toolName: tool.name };
  const last = run.processingSteps.at(-1);
  if (!last) return { kind: "starting" };
  return { kind: last.type === "response" ? "replying" : "thinking" };
}

export type SubtaskParentState =
  | "dispatching"
  | "checking"
  | "planning"
  | "querying"
  | "thinking"
  | "replying"
  | "retry"
  | "waitingForSlot"
  | "ended"
  | "idle";

const TOOL_STATES: Record<string, SubtaskParentState> = {
  spawn_subagent: "dispatching",
  get_decomposition_status: "checking",
  plan_decomposition_topic: "planning"
};

/** One word for what the lead agent is doing; all its other tools only read. */
export function subtaskParentState(
  parent: SubagentParentActivity,
  waitingForSlot: boolean,
  pkg: TrackedSubagentPackage | undefined
): SubtaskParentState {
  if (waitingForSlot) return "waitingForSlot";
  if (pkg?.endedAt) return "ended";
  if (parent.kind === "tool") return TOOL_STATES[parent.toolName] ?? "querying";
  return parent.kind;
}
