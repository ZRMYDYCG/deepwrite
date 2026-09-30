import { describe, expect, it, vi } from "vitest";
import {
  syncEqual,
  syncKey,
  syncModelConfigItem,
  syncModelConfigSchema,
  type SyncedModelChange,
  type SyncItem,
  type SyncModelConfig,
  type SyncModelEntry,
  type SyncWorkspacePort
} from "@deepwrite/contracts";
import { DeviceSyncService } from "./engine/service";
import { MemoryDav, connect, device, item } from "./engine/sync-test-support";
import { withModelConfigSync, type ModelSyncPort } from "./model-workspace";

function model(overrides: Record<string, unknown> = {}): SyncModelConfig {
  return syncModelConfigSchema.parse({
    id: "model_writer",
    label: "写作模型",
    provider: "custom",
    modelId: "writer-v1",
    api: "openai-completions",
    baseUrl: "https://example.test/v1",
    reasoning: false,
    defaultThinkingLevel: "off",
    thinkingLevelOptions: ["minimal", "low", "medium", "high", "xhigh", "max"],
    temperatureOptions: [0.1, 0.7, 1],
    ...overrides
  });
}

const entry = (model: SyncModelConfig, apiKey?: string): SyncModelEntry => ({
  model,
  ...(apiKey ? { apiKey } : {})
});

function modelPort(initial: SyncModelEntry[] = []) {
  const models = new Map(initial.map((value) => [value.model.id, value]));
  const calls: SyncedModelChange[][] = [];
  const port: ModelSyncPort = {
    listSyncModels: async () => [...models.values()],
    applySyncedModels: async (changes) => {
      calls.push(structuredClone(changes));
      for (const change of changes) {
        if (
          change.expected !== undefined &&
          !syncEqual(models.get(change.id) ?? null, change.expected)
        )
          throw new Error("stale");
        if (change.next) models.set(change.id, change.next);
        else models.delete(change.id);
      }
    }
  };
  return { models, calls, port };
}

function projectPort(items: SyncItem[] = []) {
  const port: SyncWorkspacePort = {
    list: vi.fn(async () => ({ items, issues: [] })),
    validate: vi.fn(async () => undefined),
    recover: vi.fn(async () => undefined),
    apply: vi.fn(async () => undefined)
  };
  return port;
}

describe("withModelConfigSync routing", () => {
  it("lists project items followed by one item per custom model", async () => {
    const project = item();
    const workspace = withModelConfigSync(
      projectPort([project]),
      modelPort([entry(model())]).port
    );
    const listed = await workspace.list();
    expect(listed.items.map(syncKey)).toEqual([
      syncKey(project),
      "model-config:model_writer"
    ]);
  });

  it("fails closed when the model store cannot be read", async () => {
    const workspace = withModelConfigSync(projectPort(), {
      listSyncModels: async () => {
        throw new Error("model store unreadable");
      },
      applySyncedModels: async () => undefined
    });
    await expect(workspace.list()).rejects.toThrow("model store unreadable");
  });

  it("validates model items locally and other items in the project workspace", async () => {
    const projects = projectPort();
    const workspace = withModelConfigSync(projects, modelPort().port);
    const valid = syncModelConfigItem(model());
    await expect(workspace.validate(valid)).resolves.toBeUndefined();
    expect(projects.validate).not.toHaveBeenCalled();

    const tampered: SyncItem = {
      ...valid,
      files: {
        "deepwrite.json": valid.files["deepwrite.json"]!.replace(
          '"label"',
          '"apiKey":"sk-invalid-placeholder","label"'
        )
      }
    };
    await expect(workspace.validate(tampered)).rejects.toThrow();

    const project = item();
    await workspace.validate(project);
    expect(projects.validate).toHaveBeenCalledWith(project);
  });

  it("routes model keys to the model store and project keys to the project workspace", async () => {
    const projects = projectPort();
    const models = modelPort([entry(model())]);
    const workspace = withModelConfigSync(projects, models.port);
    const current = syncModelConfigItem(model());
    const renamed = syncModelConfigItem(model({ label: "改名后的模型" }));

    await workspace.apply(syncKey(current), current, renamed);
    expect(models.models.get("model_writer")?.model.label).toBe("改名后的模型");
    expect(projects.apply).not.toHaveBeenCalled();

    await workspace.apply(syncKey(renamed), renamed, null);
    expect(models.models.size).toBe(0);

    const project = item();
    await workspace.apply(syncKey(project), null, project);
    expect(projects.apply).toHaveBeenCalledWith(
      syncKey(project),
      null,
      project
    );
    expect(models.calls).toHaveLength(2);
  });

  it("refuses a model change whose payload does not belong to the key", async () => {
    const models = modelPort();
    const workspace = withModelConfigSync(projectPort(), models.port);
    const other = syncModelConfigItem(model({ id: "model_other" }));
    const current = syncModelConfigItem(model());

    await expect(
      workspace.apply("model-config:model_writer", null, other)
    ).rejects.toThrow("同步目标不一致");
    await expect(
      workspace.apply("model-config:model_writer", other, null)
    ).rejects.toThrow("同步目标不一致");
    await expect(
      workspace.apply("model-config:model_writer", null, null)
    ).rejects.toThrow("同步目标不一致");
    expect(models.calls).toEqual([]);
    expect(current.id).toBe("model_writer");
  });

  it("initialization applies models first and hands only project items to the project replace", async () => {
    const order: string[] = [];
    const models = modelPort();
    const apply = models.port.applySyncedModels;
    models.port.applySyncedModels = async (changes) => {
      order.push("models");
      await apply(changes);
    };
    const replace = vi.fn(async () => {
      order.push("projects");
    });
    const projects: SyncWorkspacePort = {
      ...projectPort(),
      initialization: { inspect: vi.fn(), replace }
    };
    const workspace = withModelConfigSync(projects, models.port);
    const project = item();
    const metadata = {} as never;

    await workspace.initialization!.replace(
      [project, syncModelConfigItem(model())],
      metadata,
      "fingerprint",
      new AbortController().signal
    );

    expect(order).toEqual(["models", "projects"]);
    expect(replace).toHaveBeenCalledWith(
      [project],
      metadata,
      "fingerprint",
      expect.anything()
    );
    expect(models.calls[0]).toEqual([
      { id: "model_writer", next: entry(model()) }
    ]);
    expect(models.calls[0]![0]).not.toHaveProperty("expected");
  });
});

function withModels(
  base: ReturnType<typeof device>,
  models: ReturnType<typeof modelPort>
) {
  return {
    ...base,
    models,
    service: new DeviceSyncService({
      ...base.options,
      workspace: withModelConfigSync(base.options.workspace, models.port)
    })
  };
}

async function pair(pcModels: SyncModelEntry[]) {
  const dav = new MemoryDav();
  const pc = withModels(device("pc", dav), modelPort(pcModels));
  const phone = withModels(device("phone", dav), modelPort());
  const space = await connect(pc);
  expect((await pc.service.sync([], true)).issues).toEqual([]);
  await connect(phone, space);
  expect((await phone.service.sync([], true)).issues).toEqual([]);
  return { pc, phone, dav };
}

const setModel = (
  side: { models: ReturnType<typeof modelPort> },
  config: SyncModelConfig,
  apiKey?: string
) => side.models.models.set(config.id, entry(config, apiKey));
const labelOf = (side: { models: ReturnType<typeof modelPort> }, id: string) =>
  side.models.models.get(id)?.model.label;
const keyOf = (side: { models: ReturnType<typeof modelPort> }, id: string) =>
  side.models.models.get(id)?.apiKey;

describe("custom model sync between two devices", () => {
  it("copies a model to the other device and stores no key when there is none", async () => {
    const { pc, phone, dav } = await pair([entry(model())]);

    expect(phone.models.models.get("model_writer")).toEqual(entry(model()));
    expect(phone.models.calls.at(-1)).toEqual([
      { id: "model_writer", expected: null, next: entry(model()) }
    ]);
    expect([...dav.files.values()].some((value) => value.includes("sk-"))).toBe(
      false
    );
    expect((await pc.service.sync()).issues).toEqual([]);
  });

  it("carries the API key to the other device as a separate file next to the model", async () => {
    const { pc, phone, dav } = await pair([
      entry(model(), "sk-sync-test-only")
    ]);

    expect(keyOf(phone, "model_writer")).toBe("sk-sync-test-only");
    const packs = [...dav.files.values()].filter((value) =>
      value.includes("sk-sync-test-only")
    );
    expect(packs).toHaveLength(1);
    const contents = Object.values(
      (JSON.parse(packs[0]!) as { files: Record<string, string> }).files
    );
    expect(contents).toHaveLength(2);
    const [holder, ...others] = contents.filter((content) =>
      content.includes("sk-sync-test-only")
    );
    expect(others).toEqual([]);
    expect(holder).toContain("deepwrite.model-secret");
    expect((await pc.service.sync()).issues).toEqual([]);
  });

  it("syncs edits in both directions", async () => {
    const { pc, phone } = await pair([entry(model())]);

    setModel(phone, model({ label: "手机改名" }));
    setModel(phone, model({ id: "model_second", label: "手机新增" }));
    expect((await phone.service.sync()).issues).toEqual([]);
    expect((await pc.service.sync()).issues).toEqual([]);
    expect(labelOf(pc, "model_writer")).toBe("手机改名");
    expect(labelOf(pc, "model_second")).toBe("手机新增");

    setModel(pc, model({ id: "model_second", label: "电脑再改" }));
    expect((await pc.service.sync()).issues).toEqual([]);
    expect((await phone.service.sync()).issues).toEqual([]);
    expect(labelOf(phone, "model_second")).toBe("电脑再改");
  });

  it("syncs key changes in both directions, removing a key only after it is adopted", async () => {
    const { pc, phone } = await pair([entry(model(), "sk-first-test-only")]);

    setModel(phone, model(), "sk-second-test-only");
    expect((await phone.service.sync()).issues).toEqual([]);
    expect((await pc.service.sync()).issues).toEqual([]);
    expect(keyOf(pc, "model_writer")).toBe("sk-second-test-only");

    setModel(pc, model());
    expect((await pc.service.sync()).issues).toEqual([]);
    expect((await phone.service.sync()).issues).toHaveLength(1);
    expect(keyOf(phone, "model_writer")).toBe("sk-second-test-only");
    expect(
      (
        await phone.service.sync([], false, "both", {
          side: "remote",
          keys: ["model-config:model_writer"]
        })
      ).issues
    ).toEqual([]);
    expect(phone.models.models.get("model_writer")).toEqual(entry(model()));

    setModel(phone, model(), "sk-third-test-only");
    expect((await phone.service.sync()).issues).toEqual([]);
    expect((await pc.service.sync()).issues).toEqual([]);
    expect(keyOf(pc, "model_writer")).toBe("sk-third-test-only");
  });

  it("merges a label change on one side with a key change on the other", async () => {
    const { pc, phone } = await pair([entry(model(), "sk-first-test-only")]);

    setModel(phone, model({ label: "手机改名" }), "sk-first-test-only");
    setModel(pc, model(), "sk-pc-test-only");
    expect((await phone.service.sync()).issues).toEqual([]);
    expect((await pc.service.sync()).issues).toEqual([]);
    expect((await phone.service.sync()).issues).toEqual([]);
    for (const side of [pc, phone]) {
      expect(labelOf(side, "model_writer")).toBe("手机改名");
      expect(keyOf(side, "model_writer")).toBe("sk-pc-test-only");
    }
  });

  it("reports a conflict when both sides replace the key differently and leaves both keys alone", async () => {
    const { pc, phone } = await pair([entry(model(), "sk-first-test-only")]);

    setModel(phone, model(), "sk-phone-test-only");
    setModel(pc, model(), "sk-pc-test-only");
    expect((await phone.service.sync()).issues).toEqual([]);
    const result = await pc.service.sync();
    expect(result.issues).toHaveLength(1);
    expect(keyOf(pc, "model_writer")).toBe("sk-pc-test-only");
    expect(keyOf(phone, "model_writer")).toBe("sk-phone-test-only");
  });

  it("applies a remote deletion only after it is adopted, then removes the key", async () => {
    const { pc, phone } = await pair([entry(model(), "sk-sync-test-only")]);

    pc.models.models.clear();
    expect((await pc.service.sync()).issues).toEqual([]);
    expect((await phone.service.sync()).issues).toHaveLength(1);
    expect(phone.models.models.size).toBe(1);
    expect(keyOf(phone, "model_writer")).toBe("sk-sync-test-only");

    const result = await phone.service.sync([], false, "both", {
      side: "remote",
      keys: ["model-config:model_writer"]
    });
    expect(result.issues).toEqual([]);
    expect(phone.models.models.size).toBe(0);
  });

  it("never exposes a usable key in the status shown to the interface", async () => {
    const { pc, phone } = await pair([
      entry(model(), "sk-sync-test-only-0123456789")
    ]);

    setModel(phone, model(), "sk-phone-test-only-9876543210");
    setModel(pc, model(), "sk-pc-test-only-abcdefghij");
    await phone.service.sync();
    const conflicted = await pc.service.sync();
    expect(conflicted.issues).toHaveLength(1);

    const status = JSON.stringify(await pc.service.status());
    for (const key of [
      "sk-sync-test-only-0123456789",
      "sk-phone-test-only-9876543210",
      "sk-pc-test-only-abcdefghij"
    ])
      expect(status).not.toContain(key);
    expect(status).toContain("••••");
  });
});
