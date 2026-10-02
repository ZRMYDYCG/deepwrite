import { SUBAGENT_TASK_BATCH_MAX_COUNT } from "@deepwrite/contracts";
import type {
  RuntimeSubagentDefinition,
  SubagentTaskRequest
} from "./subagent-types";
import {
  parseSubagentWriteScope,
  writeScopesConflict
} from "./subagent-write-scope";

const TASK_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

interface RawSubagentTask {
  key?: unknown;
  subagent_id?: unknown;
  task?: unknown;
  depends_on?: unknown;
  write_scope?: unknown;
  library_id?: unknown;
}

function stringList(value: unknown, field: string, key: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`任务 ${key} 的 ${field} 必须是字符串数组。`);
  }
  return [...new Set(value.map((item: string) => item.trim()))].filter(Boolean);
}

function assertAcyclic(tasks: readonly SubagentTaskRequest[]): void {
  const byKey = new Map(tasks.map((task) => [task.key, task]));
  const state = new Map<string, "visiting" | "done">();
  const visit = (key: string, path: string[]): void => {
    if (state.get(key) === "done") return;
    if (state.get(key) === "visiting") {
      throw new Error(`任务依赖形成循环：${[...path, key].join(" → ")}。`);
    }
    state.set(key, "visiting");
    for (const dependency of byKey.get(key)?.dependsOn ?? []) {
      visit(dependency, [...path, key]);
    }
    state.set(key, "done");
  };
  for (const task of tasks) visit(task.key, []);
}

/** Whether `from` already waits for `to`, directly or transitively. */
function dependsOn(
  byKey: ReadonlyMap<string, SubagentTaskRequest>,
  from: string,
  to: string
): boolean {
  const seen = new Set<string>();
  const pending = [...(byKey.get(from)?.dependsOn ?? [])];
  while (pending.length > 0) {
    const key = pending.pop()!;
    if (key === to) return true;
    if (seen.has(key)) continue;
    seen.add(key);
    pending.push(...(byKey.get(key)?.dependsOn ?? []));
  }
  return false;
}

/** Later tasks whose write scope overlaps an earlier one wait for it. */
function orderOverlappingScopes(tasks: readonly SubagentTaskRequest[]): void {
  const byKey = new Map(tasks.map((task) => [task.key, task]));
  for (const [laterIndex, later] of tasks.entries()) {
    for (const earlier of tasks.slice(0, laterIndex)) {
      if (!writeScopesConflict(earlier.writeScope, later.writeScope)) continue;
      if (
        dependsOn(byKey, later.key, earlier.key) ||
        dependsOn(byKey, earlier.key, later.key)
      ) {
        continue;
      }
      later.dependsOn.push(earlier.key);
      later.implicitDependsOn.push(earlier.key);
    }
  }
}

/**
 * Validates one `spawn_subagent` task list. Throwing returns the message to
 * the parent model as a tool error so it can correct the arrangement.
 */
export function planSubagentTasks(
  rawTasks: unknown,
  definitions: readonly RuntimeSubagentDefinition[],
  parallel: boolean
): SubagentTaskRequest[] {
  if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
    throw new Error(
      `tasks 必须包含 1 到 ${SUBAGENT_TASK_BATCH_MAX_COUNT} 个子任务。`
    );
  }
  if (rawTasks.length > SUBAGENT_TASK_BATCH_MAX_COUNT) {
    throw new Error(
      `tasks 必须包含 1 到 ${SUBAGENT_TASK_BATCH_MAX_COUNT} 个子任务，本次提交了 ${rawTasks.length} 个，未执行任何任务。请按依赖关系拆成多次调用，每次不超过 ${SUBAGENT_TASK_BATCH_MAX_COUNT} 个。`
    );
  }
  const keys = new Set<string>();
  const tasks = rawTasks.map((value: unknown, index): SubagentTaskRequest => {
    const raw = (
      typeof value === "object" && value !== null ? value : {}
    ) as RawSubagentTask;
    const key =
      typeof raw.key === "string" && raw.key.trim()
        ? raw.key.trim()
        : `t${index + 1}`;
    if (!TASK_KEY_PATTERN.test(key)) {
      throw new Error(
        `任务 key「${key}」无效：只能使用字母、数字、下划线和连字符，最长 40 个字符。`
      );
    }
    if (keys.has(key)) throw new Error(`任务 key 重复：${key}。`);
    keys.add(key);

    const subagentId = String(raw.subagent_id ?? "");
    const definition = definitions.find(
      (candidate) => candidate.id === subagentId
    );
    if (!definition) {
      throw new Error(`未知或已停用的子智能体：${subagentId}`);
    }
    const libraryManager = definition.toolSource === "library-management";
    const libraryId =
      typeof raw.library_id === "string" && raw.library_id.trim()
        ? raw.library_id.trim()
        : undefined;
    if (!libraryManager && libraryId) {
      throw new Error("普通团队成员不能指定资料库管理目标。");
    }
    const task = String(raw.task ?? "").trim();
    if (!task) throw new Error("子智能体任务不能为空。");
    const writeScope = parallel
      ? stringList(raw.write_scope, "write_scope", key)
      : [];
    if (libraryManager && writeScope.length > 0) {
      throw new Error("资料库管理成员不使用 write_scope。");
    }

    return {
      index,
      key,
      definition,
      task,
      ...(libraryId ? { libraryId } : {}),
      dependsOn: stringList(raw.depends_on, "depends_on", key),
      implicitDependsOn: [],
      ...(parallel
        ? {
            writeScope: libraryManager
              ? { kind: "exclusive" as const }
              : parseSubagentWriteScope(writeScope)
          }
        : {})
    };
  });

  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (dependency === task.key) {
        throw new Error(`任务 ${task.key} 不能依赖自己。`);
      }
      if (!keys.has(dependency)) {
        throw new Error(`任务 ${task.key} 依赖了不存在的任务：${dependency}。`);
      }
    }
  }
  assertAcyclic(tasks);
  if (parallel) orderOverlappingScopes(tasks);
  return tasks;
}
