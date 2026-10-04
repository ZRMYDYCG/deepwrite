import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  DecompositionToolJsonSchemas,
  DecompositionSubmissionDataSchema,
  DecompositionReceiptSchema,
  type DecompositionReceipt,
  type DecompositionSubmissionData,
  type ExtrasAgentResolvedTaskOf
} from "@deepwrite/contracts";
import type { ExtrasAgentRunServices } from "../../definition";
import { extrasOutputResult } from "../../output";
import { defineStrictTool } from "../../tools/analysis-inputs";
import { decompositionRole, type DecompositionRole } from "./roles";
type Task = ExtrasAgentResolvedTaskOf<"long-book-decomposition">;
const submissions: Record<DecompositionRole, string[]> = {
  reader: ["submit_chapter_reading"],
  registrar: ["submit_registry_part"],
  chronicler: ["write_chronicle"],
  plot_architect: ["write_book_line", "write_foreshadowing", "write_opening"],
  character_archivist: ["write_character_dossier", "write_character_biography"],
  world_archivist: ["write_world_category"],
  style_analyst: ["write_style_profile"],
  continuity_keeper: ["write_latest_continuity"],
  reviewer: ["report_review_issues"],
  generalist: ["write_topic"]
};
const assetKinds: Record<string, string> = {
  write_chronicle: "chronicle",
  write_book_line: "book-line",
  write_foreshadowing: "foreshadowing",
  write_opening: "opening",
  write_character_dossier: "character",
  write_character_biography: "character-volume",
  write_world_category: "world",
  write_style_profile: "style",
  write_latest_continuity: "continuity",
  write_topic: "topic"
};
const dataKinds: Record<string, string> = {
  ...assetKinds,
  submit_chapter_reading: "reading",
  submit_registry_part: "registry",
  report_review_issues: "review"
};
const notes: Record<string, string> = {
  submit_chapter_reading:
    "每项一个 reading 单元，data.card.chapters 只放这一章；本块全部章节保存后系统自动完成阅读块。",
  write_character_dossier:
    "registryId 使用单元前缀冒号后的标识，不含 character:。",
  write_character_biography:
    "registryId、volume、startOrder、endOrder 与单元的分卷范围一致。",
  write_world_category: "categoryId 使用单元前缀冒号后的标识，不含 world:。"
};
function submissionUnitIds(task: Task, name: string, role: DecompositionRole) {
  const kind = dataKinds[name]!;
  return Object.entries(task.input.units)
    .filter(([id, unit]) => {
      if (unit.status === "done" || decompositionRole(id) !== role)
        return false;
      if (kind === "reading") return id.startsWith("reading:");
      if (["book-line", "foreshadowing", "opening"].includes(kind))
        return id === `plot:${kind}`;
      return id.startsWith(`${kind}:`);
    })
    .map(([id]) => id);
}
export async function saveDecompositionSubmission(
  task: Task,
  services: ExtrasAgentRunServices,
  unitId: string,
  rawData: unknown
): Promise<{
  data: DecompositionSubmissionData;
  receipt: DecompositionReceipt;
}> {
  if (!services.decompositionSubmit)
    throw new Error("拆解持久化提交桥不可用。");
  const data = DecompositionSubmissionDataSchema.parse(rawData);
  const unit = task.input.units[unitId];
  if (!unit) throw new Error("提交单元不在本工作包授权范围内。");
  const receipt = DecompositionReceiptSchema.parse(
    await services.decompositionSubmit({
      jobId: task.input.jobId,
      outputVersion: task.input.outputVersion,
      attemptId: task.input.attemptId,
      unitId,
      inputRevision: unit.inputRevision,
      data
    })
  );
  if (
    receipt.jobId !== task.input.jobId ||
    receipt.unitId !== unitId ||
    receipt.inputRevision !== unit.inputRevision ||
    receipt.outputVersion !== task.input.outputVersion
  )
    throw new Error("保存回执与本次提交不一致。");
  return { data, receipt };
}
function decompositionOutput(
  task: Task,
  unitId: string,
  data: DecompositionSubmissionData,
  receipt: DecompositionReceipt,
  message = "真实内容与回执已保存。"
) {
  const kind =
    data.kind === "reading" || data.kind === "finish-card"
      ? "decomposition-card"
      : data.kind === "registry"
        ? "decomposition-registry"
        : data.kind === "review"
          ? "decomposition-review"
          : "decomposition-asset";
  return extrasOutputResult(
    { agentId: "long-book-decomposition", jobId: task.input.jobId },
    message,
    { kind, outputVersion: receipt.outputVersion, unitId, receipt }
  );
}
export async function persistDecompositionSubmission(
  task: Task,
  services: ExtrasAgentRunServices,
  unitId: string,
  rawData: unknown
) {
  const { data, receipt } = await saveDecompositionSubmission(
    task,
    services,
    unitId,
    rawData
  );
  return decompositionOutput(task, unitId, data, receipt);
}
function assertToolKind(
  name: string,
  role: DecompositionRole,
  data: DecompositionSubmissionData
) {
  if (
    assetKinds[name] &&
    (data.kind !== "asset" || data.asset.kind !== assetKinds[name])
  )
    throw new Error("角色提交类型不匹配。");
  if (role === "reader" && data.kind !== "reading")
    throw new Error("阅读提交类型不匹配。");
  if (
    (role === "registrar" && data.kind !== "registry") ||
    (role === "reviewer" && data.kind !== "review")
  )
    throw new Error("提交类型不匹配。");
}
/** A chunk completes as soon as every one of its checkpoints is saved. */
export async function finishChunks(
  task: Task,
  services: ExtrasAgentRunServices,
  saved: ReadonlySet<string>
) {
  const finished: Array<{ unitId: string; receipt: DecompositionReceipt }> = [];
  for (const id of task.input.unitIds) {
    const chunk = task.input.units[id];
    if (!id.startsWith("chunk:") || !chunk || chunk.status === "done") continue;
    const complete = chunk.dependencies.every(
      (dependency) =>
        saved.has(dependency) || task.input.units[dependency]?.status === "done"
    );
    if (!complete) continue;
    const { receipt } = await saveDecompositionSubmission(task, services, id, {
      kind: "finish-card"
    });
    chunk.status = "done";
    finished.push({ unitId: id, receipt });
  }
  return finished;
}
/**
 * Role tools take a batch: one call saves every unit the child finished, so
 * results do not cost a request each. Tool schemas carry no task ids, which
 * keeps them identical for every child of a role; ids are checked here and
 * again by Main and Core.
 */
export function decompositionSubmissionTools(
  task: Task,
  services: ExtrasAgentRunServices,
  role: DecompositionRole
): AgentTool[] {
  return submissions[role].map((name) => {
    const ids = submissionUnitIds(task, name, role);
    return defineStrictTool({
      name,
      label: name,
      description: `批量提交本任务单元的完整结构化产出，items 每项一个单元，尽量一次提交全部；等待真实目标保存后逐项返回结果，只需重交失败项。单元 id 见任务消息。${notes[name] ?? ""}`,
      parameters: Type.Object({
        items: Type.Array(
          Type.Object({
            unitId: Type.String(),
            data: Type.Unsafe<DecompositionSubmissionData>(
              (DecompositionToolJsonSchemas as Record<string, object>)[
                dataKinds[name]!
              ]!
            )
          }),
          { minItems: 1, maxItems: 20 }
        )
      }),
      execute: async (_id, params) => {
        if (!ids.length) throw new Error("本任务没有此类单元可提交。");
        const saved = new Set<string>();
        const lines: string[] = [];
        let last:
          | {
              unitId: string;
              data: DecompositionSubmissionData;
              receipt: DecompositionReceipt;
            }
          | undefined;
        for (const item of params.items) {
          try {
            if (!ids.includes(item.unitId))
              throw new Error("提交单元不在本工作包授权范围内。");
            const parsed = DecompositionSubmissionDataSchema.parse(item.data);
            assertToolKind(name, role, parsed);
            const result = await saveDecompositionSubmission(
              task,
              services,
              item.unitId,
              parsed
            );
            saved.add(item.unitId);
            task.input.units[item.unitId]!.status = "done";
            last = { unitId: item.unitId, ...result };
            lines.push(`${item.unitId}：已保存`);
          } catch (error) {
            lines.push(
              `${item.unitId}：未保存（${error instanceof Error ? error.message : "保存失败"}）`
            );
          }
        }
        if (role === "reader")
          for (const chunk of await finishChunks(task, services, saved)) {
            last = {
              unitId: chunk.unitId,
              data: { kind: "finish-card" },
              receipt: chunk.receipt
            };
            lines.push(`${chunk.unitId}：本块全部章节已保存，阅读块已完成`);
          }
        const pending = ids.filter(
          (id) => task.input.units[id]?.status !== "done"
        );
        if (pending.length) lines.push(`仍未保存：${pending.join("、")}`);
        if (!last) throw new Error(lines.join("\n"));
        return decompositionOutput(
          task,
          last.unitId,
          last.data,
          last.receipt,
          lines.join("\n")
        );
      }
    });
  });
}
