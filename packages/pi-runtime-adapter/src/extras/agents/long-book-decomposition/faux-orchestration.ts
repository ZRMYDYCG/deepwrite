import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall
} from "@earendil-works/pi-ai";
import type { ExtrasAgentResolvedTaskOf } from "@deepwrite/contracts";
import { decompositionRole, type DecompositionRole } from "./roles";
type Task = ExtrasAgentResolvedTaskOf<"long-book-decomposition">;

export function fauxDecompositionParent(task: Task) {
  const groups = new Map<DecompositionRole, string[]>();
  for (const id of task.input.unitIds) {
    const role = decompositionRole(id);
    groups.set(role, [...(groups.get(role) ?? []), id]);
  }
  const taskGroups: Array<[DecompositionRole, string[]]> = [];
  for (const [role, ids] of groups) {
    if (
      ["reader", "registrar", "chronicler", "character_archivist"].includes(
        role
      )
    )
      ids.forEach((id) => taskGroups.push([role, [id]]));
    else taskGroups.push([role, ids]);
  }
  return [
    fauxAssistantMessage(
      fauxToolCall("spawn_subagent", {
        tasks: taskGroups.map(([role, ids], index) => ({
          key: `t${index + 1}`,
          subagent_id: role,
          task: `完成单元：${ids.join("、")}`
        }))
      }),
      { stopReason: "toolUse" }
    ),
    fauxAssistantMessage(fauxText("本工作包已提交，请以持久化回执核对覆盖。"))
  ];
}
export function fauxDecompositionChild(task: Task, role: DecompositionRole) {
  return task.input.unitIds
    .filter((id) => decompositionRole(id) === role)
    .map((unitId) =>
      fauxAssistantMessage(
        fauxToolCall("faux_complete_decomposition_unit", { unitId }),
        { stopReason: "toolUse" }
      )
    )
    .concat([fauxAssistantMessage(fauxText("已完成授权单元。"))]);
}
