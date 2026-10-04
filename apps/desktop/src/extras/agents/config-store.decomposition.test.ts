import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  DEFAULT_DECOMPOSITION_PROFILE,
  ExtrasAgentSettingsInputSchema
} from "@deepwrite/contracts";
import { ExtrasAgentConfigStore } from "./config-store";

const roots: string[] = [];
const custom = {
  id: "decomposition-custom",
  name: "自定义拆解",
  description: "保存后可在新进程使用。",
  systemPrompt: "关注设定证据。",
  worldCategories: [{ id: "rules", title: "规则", hint: "按章号整理。" }]
};
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "deepwrite-decomposition-config-"));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

it("保存拆解自定义方案后，新存储实例仍可权威解析，内置标记只在响应中推导", async () => {
  const root = await directory();
  await new ExtrasAgentConfigStore(root).save({
    agentId: "long-book-decomposition",
    profiles: [custom]
  });
  const reopened = new ExtrasAgentConfigStore(root);
  expect(await reopened.resolve("long-book-decomposition", custom.id)).toEqual(
    custom
  );
  expect(
    (await reopened.list("long-book-decomposition")).profiles[0]?.builtin
  ).toBe(true);
  const disk = JSON.parse(
    await readFile(
      join(root, "config", "extras-agents", "long-book-decomposition.json"),
      "utf8"
    )
  ) as { profiles: Array<Record<string, unknown>> };
  expect(disk.profiles.every((profile) => !("builtin" in profile))).toBe(true);
});

it("兼容先前磁盘中的内置标记，保留自定义方案，Renderer 仍不能声明内置身份", async () => {
  const root = await directory();
  const config = join(root, "config", "extras-agents");
  await mkdir(config, { recursive: true });
  await writeFile(
    join(config, "long-book-decomposition.json"),
    JSON.stringify({
      version: 1,
      profiles: [DEFAULT_DECOMPOSITION_PROFILE, custom]
    })
  );
  const store = new ExtrasAgentConfigStore(root);
  expect(await store.resolve("long-book-decomposition", custom.id)).toEqual(
    custom
  );
  expect(
    ExtrasAgentSettingsInputSchema.safeParse({
      agentId: "long-book-decomposition",
      profiles: [{ ...custom, builtin: true }]
    }).success
  ).toBe(false);
});
