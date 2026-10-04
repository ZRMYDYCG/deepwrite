import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { DecompositionSubmitInput } from "@deepwrite/contracts";
import { decompositionFixture } from "./test-support";
import { addDecompositionUnit } from "./workflow";
import { requeueDecompositionUnit } from "./unit-retry";

const roots: string[] = [];
vi.setConfig({ testTimeout: 30_000 });
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});
async function styleFixture() {
  const fixture = await decompositionFixture("materials");
  roots.push(fixture.root);
  fixture.job.units = {};
  fixture.job.phase = "integrate";
  addDecompositionUnit(fixture.job, "style:profile", "integrate");
  await fixture.service.state.save(fixture.job);
  const attemptId = "ldattempt_style";
  const { job } = await fixture.service.open(
    { jobId: fixture.job.id, phase: "integrate", unitIds: ["style:profile"] },
    fixture.job.profile.id,
    attemptId
  );
  const input: DecompositionSubmitInput = {
    jobId: job.id,
    outputVersion: job.outputVersion,
    attemptId,
    unitId: "style:profile",
    inputRevision: job.units["style:profile"]!.inputRevision,
    data: {
      kind: "asset",
      asset: {
        kind: "style",
        content: "人物行动推动叙事。",
        excerpts: [
          {
            chapterOrder: 1,
            text: fixture.source.chapters[0]!.text,
            comment: "动作与目标连用。"
          }
        ]
      }
    }
  };
  return { ...fixture, input };
}

it("一个单元跨两次素材写入时，部分回执不能冒充完整完成", async () => {
  const fixture = await styleFixture();
  const original = fixture.catalog.writeManagedEntry.bind(fixture.catalog);
  let count = 0;
  vi.spyOn(fixture.catalog, "writeManagedEntry").mockImplementation((input) =>
    ++count === 2
      ? Promise.reject(new Error("模拟第二条写入中断"))
      : original(input)
  );
  await expect(fixture.service.submit(fixture.input)).rejects.toThrow("中断");
  const partial = await fixture.service.recover(
    await fixture.service.state.load(fixture.job.id),
    true
  );
  expect(partial.units["style:profile"]!.status).toBe("pending");
  expect(partial.units["style:profile"]!.requiredReceiptIds).toHaveLength(2);
  await fixture.service.control({ jobId: fixture.job.id, action: "resume" });
  const resumed = await fixture.service.open(
    { jobId: fixture.job.id, phase: "integrate", unitIds: ["style:profile"] },
    fixture.job.profile.id,
    "ldattempt_resumed"
  );
  await fixture.service.submit({
    ...fixture.input,
    attemptId: resumed.input.attemptId
  });
  const recovered = await fixture.service.recover(
    await fixture.service.state.load(fixture.job.id),
    true
  );
  expect(recovered.units["style:profile"]!.status).toBe("done");
  expect(recovered.units["style:profile"]!.outputRefs).toHaveLength(2);
  const snapshot = await fixture.catalog.snapshot();
  expect(
    snapshot.materials.find(({ materialKind }) => materialKind === "draft")!
      .entries
  ).toHaveLength(2);
});

it("目标与回执已落盘、任务状态更新中断后，以真实回执恢复且重放不重复写入", async () => {
  const fixture = await styleFixture();
  const save = fixture.service.state.save.bind(fixture.service.state);
  let failed = false;
  vi.spyOn(fixture.service.state, "save").mockImplementation((job) => {
    if (!failed && job.units["style:profile"]!.status === "done") {
      failed = true;
      return Promise.reject(new Error("模拟状态更新中断"));
    }
    return save(job);
  });
  await expect(fixture.service.submit(fixture.input)).rejects.toThrow("中断");
  const recovered = await fixture.service.recover(
    await fixture.service.state.load(fixture.job.id)
  );
  expect(recovered.units["style:profile"]!.status).toBe("done");
  const before =
    recovered.target?.kind === "material-group"
      ? recovered.target.baseRevisions
      : {};
  const receipt = await fixture.service.submit(fixture.input);
  const after = await fixture.service.state.load(fixture.job.id);
  expect(receipt.refs).toHaveLength(2);
  expect(
    after.target?.kind === "material-group" ? after.target.baseRevisions : {}
  ).toEqual(before);
});

it("用户编辑产生冲突，保留或明确批准重新生成，且其他用户内容继续存在", async () => {
  const fixture = await styleFixture();
  const receipt = await fixture.service.submit(fixture.input);
  await fixture.service.control({
    jobId: fixture.job.id,
    action: "finish-package",
    attemptId: fixture.input.attemptId
  });
  const ref = receipt.refs[0]!;
  const root = await fixture.catalog.managedProjectDirectory(ref.projectId);
  const manifest = JSON.parse(
    await readFile(join(root, "deepwrite.json"), "utf8")
  ) as { entries: Array<{ id: string; path: string }> };
  const path = join(
    root,
    manifest.entries.find(({ id }) => id === ref.resourceId)!.path
  );
  const original = await readFile(path, "utf8");
  expect(original).not.toContain("deepwrite-decomposition");
  expect(original).not.toContain("style:profile");
  await writeFile(
    path,
    original.replace("人物行动推动叙事。", "用户补充：人物行动推动叙事。") +
      "\n用户独立笔记\n"
  );
  const conflict = await fixture.service.recover(
    await fixture.service.state.load(fixture.job.id)
  );
  expect(conflict.units["style:profile"]!.status).toBe("conflict");
  await fixture.service.control({
    jobId: fixture.job.id,
    action: "resolve-conflict",
    unitId: "style:profile",
    conflictChoice: "keep-user"
  });
  expect(
    (
      await fixture.service.recover(
        await fixture.service.state.load(fixture.job.id)
      )
    ).units["style:profile"]!.status
  ).toBe("done");
  expect(await readFile(path, "utf8")).toContain("用户補".replace("補", "补"));
  const adopted = await readFile(path, "utf8");
  await writeFile(path, adopted.replace("用户补充：", "又一次编辑："));
  expect(
    (
      await fixture.service.recover(
        await fixture.service.state.load(fixture.job.id)
      )
    ).units["style:profile"]!.status
  ).toBe("conflict");
  const pending = (await fixture.service.control({
    jobId: fixture.job.id,
    action: "resolve-conflict",
    unitId: "style:profile",
    conflictChoice: "regenerate"
  }))!;
  expect(pending.units["style:profile"]!.status).toBe("pending");
  const run = await fixture.service.open(
    { jobId: fixture.job.id, phase: "integrate", unitIds: ["style:profile"] },
    fixture.job.profile.id,
    "ldattempt_regenerate"
  );
  await fixture.service.submit({
    ...fixture.input,
    attemptId: run.input.attemptId,
    inputRevision: run.input.units["style:profile"]!.inputRevision
  });
  // Regenerating rewrites the generated entry as a whole.
  expect(await readFile(path, "utf8")).toContain("人物行动推动叙事。");
  expect(await readFile(path, "utf8")).not.toContain("又一次编辑：");
});

it("保留用户修改后，同一条目的后续写入必须再次询问", async () => {
  const fixture = await styleFixture();
  const receipt = await fixture.service.submit(fixture.input);
  await fixture.service.control({
    jobId: fixture.job.id,
    action: "finish-package",
    attemptId: fixture.input.attemptId
  });
  const ref = receipt.refs[0]!;
  const root = await fixture.catalog.managedProjectDirectory(ref.projectId);
  const manifest = JSON.parse(
    await readFile(join(root, "deepwrite.json"), "utf8")
  ) as { entries: Array<{ id: string; path: string }> };
  const path = join(
    root,
    manifest.entries.find(({ id }) => id === ref.resourceId)!.path
  );
  await writeFile(path, `${await readFile(path, "utf8")}\n用户笔记\n`);
  await fixture.service.recover(
    await fixture.service.state.load(fixture.job.id)
  );
  await fixture.service.control({
    jobId: fixture.job.id,
    action: "resolve-conflict",
    unitId: "style:profile",
    conflictChoice: "keep-user"
  });
  const kept = await fixture.service.state.load(fixture.job.id);
  expect(
    kept.units["style:profile"]!.outputRefs.find(
      ({ resourceId }) => resourceId === ref.resourceId
    )?.userOwned
  ).toBe(true);
  // A review repair requeues the unit and keeps its refs.
  requeueDecompositionUnit(kept, "style:profile");
  await fixture.service.state.save(kept);
  const run = await fixture.service.open(
    { jobId: fixture.job.id, phase: "integrate", unitIds: ["style:profile"] },
    fixture.job.profile.id,
    "ldattempt_after_keep"
  );
  await expect(
    fixture.service.submit({
      ...fixture.input,
      attemptId: run.input.attemptId,
      inputRevision: run.input.units["style:profile"]!.inputRevision
    })
  ).rejects.toThrow("decomposition.conflict");
  expect(await readFile(path, "utf8")).toContain("用户笔记");
});
