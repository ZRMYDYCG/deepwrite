import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_REVISION_METHOD,
  DEFAULT_STYLE_COMPARISON_METHOD,
  ExtrasAgentSettingsInputSchema
} from "@deepwrite/contracts";
import { ExtrasAgentConfigStore } from "./config-store";
import { EXTRAS_AGENT_PROFILE_CATALOGS } from "./profile-catalogs";

const temporaryDirectories: string[] = [];

async function createStore(): Promise<{
  path: string;
  store: ExtrasAgentConfigStore;
}> {
  const path = await mkdtemp(join(tmpdir(), "deepwrite-extras-config-"));
  temporaryDirectories.push(path);
  return { path, store: new ExtrasAgentConfigStore(path) };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value), "utf8");
}

const longDefaults =
  EXTRAS_AGENT_PROFILE_CATALOGS["long-book-analysis"].defaults;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("extras agent config store", () => {
  it("provides the built-in profiles of every extras agent", async () => {
    const { store } = await createStore();
    const long = await store.list("long-book-analysis");
    expect(long.profiles.map((profile) => profile.name)).toEqual([
      "剧情结构",
      "人物",
      "文风"
    ]);
    expect(long.profiles.every((profile) => profile.builtin)).toBe(true);
    expect(longDefaults[0]!.systemPrompt).toContain("大剧情");
    expect(
      (await store.list("short-book-analysis")).profiles.map(
        (profile) => profile.selectionMode
      )
    ).toEqual(["single", "single", "single"]);
    expect((await store.list("revision-analysis")).profiles).toMatchObject([
      { id: "default", systemPrompt: DEFAULT_REVISION_METHOD, builtin: true }
    ]);
    expect((await store.list("style-comparison")).profiles).toMatchObject([
      {
        id: "default",
        systemPrompt: DEFAULT_STYLE_COMPARISON_METHOD,
        builtin: true
      }
    ]);
  });

  it("serializes concurrent saves and can restore one modified default", async () => {
    const { store } = await createStore();
    const defaults = (await store.list("long-book-analysis")).profiles.map(
      ({ builtin: _builtin, ...profile }) => profile
    );
    const edited = (suffix: string) =>
      defaults.map((profile) => ({
        ...profile,
        description: `${profile.description} ${suffix}`
      }));
    await Promise.all([
      store.save({ agentId: "long-book-analysis", profiles: edited("A") }),
      store.save({ agentId: "long-book-analysis", profiles: edited("B") })
    ]);
    expect(
      (
        await store.list("long-book-analysis")
      ).profiles[0]?.description.endsWith("B")
    ).toBe(true);
    const reset = await store.reset("long-book-analysis", "plot-structure");
    expect(reset.profiles[0]).toMatchObject({
      description: longDefaults[0]!.description
    });
    await expect(store.reset("long-book-analysis", "custom")).rejects.toThrow(
      "没有可恢复的默认版本"
    );
  });

  it.each(["long-book-analysis", "short-book-analysis"] as const)(
    "reads legacy %s profiles without restoring default save destinations",
    async (agentId) => {
      const { path, store } = await createStore();
      const { builtin: _builtin, ...profile } = (await store.list(agentId))
        .profiles[0]!;
      const configPath = join(
        path,
        "config",
        "extras-agents",
        `${agentId}.json`
      );
      await writeJson(configPath, {
        version: 1,
        profiles: [
          {
            ...profile,
            id: "custom-analysis",
            name: "自定义拆书",
            output: { ...profile.output, libraryId: "legacy-library" }
          }
        ]
      });
      const resolved = await store.resolve(agentId, "custom-analysis");
      expect(resolved.systemPrompt).toBe(profile.systemPrompt);
      expect(resolved.output).toEqual(profile.output);
      expect(resolved.output).not.toHaveProperty("libraryId");
      const current = await store.list(agentId);
      await store.save(
        ExtrasAgentSettingsInputSchema.parse({
          agentId,
          profiles: current.profiles
        })
      );
      const saved = JSON.parse(await readFile(configPath, "utf8")) as {
        profiles: { id: string; output: object }[];
      };
      expect(
        saved.profiles.find((item) => item.id === "custom-analysis")?.output
      ).not.toHaveProperty("libraryId");
      await expect(store.resolve(agentId, "missing")).rejects.toThrow(
        "预设已不存在"
      );
    }
  );

  it("restores missing built-in profiles without overwriting edited defaults", async () => {
    const { store } = await createStore();
    const { builtin: _builtin, ...plot } = (
      await store.list("long-book-analysis")
    ).profiles.find((profile) => profile.id === "plot-structure")!;
    const saved = await store.save({
      agentId: "long-book-analysis",
      profiles: [{ ...plot, description: "保留用户修改后的剧情结构预设。" }]
    });
    expect(saved.profiles.map((profile) => profile.id)).toEqual([
      "character",
      "style",
      "plot-structure"
    ]);
    expect(saved.profiles.at(-1)).toMatchObject({
      description: "保留用户修改后的剧情结构预设。"
    });
  });

  it("falls back safely when the persisted JSON is damaged", async () => {
    const { path, store } = await createStore();
    const configPath = join(
      path,
      "config",
      "extras-agents",
      "long-book-analysis.json"
    );
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, "{damaged", "utf8");
    expect((await store.list("long-book-analysis")).profiles).toHaveLength(3);
    expect(await readFile(configPath, "utf8")).toBe("{damaged");
  });

  it("reads each agent's pre-unification settings until the first save", async () => {
    const { path, store } = await createStore();
    const customShort = {
      id: "custom",
      name: "自定义",
      description: "旧版本保存的预设",
      systemPrompt: "旧提示词",
      selectionMode: "multiple",
      output: { domain: "material", kind: "plot", stageId: "pacing" }
    };
    const legacyShort = join(
      path,
      "config",
      "short-book-analysis-presets.json"
    );
    await writeJson(legacyShort, { version: 1, presets: [customShort] });
    await writeJson(join(path, "revision-analysis-settings.json"), {
      systemPrompt: "旧的修改分析方法"
    });

    const short = await store.list("short-book-analysis");
    expect(short.profiles.map((profile) => profile.id)).toEqual([
      "plot-structure",
      "character",
      "style",
      "custom"
    ]);
    expect(
      (await store.resolve("revision-analysis", "default")).systemPrompt
    ).toBe("旧的修改分析方法");

    const { builtin: _builtin, ...custom } = short.profiles.at(-1)!;
    await store.save({
      agentId: "short-book-analysis",
      profiles: [{ ...custom, name: "改名后" }]
    });
    await writeJson(legacyShort, { version: 1, presets: [] });
    expect(
      (await store.list("short-book-analysis")).profiles.at(-1)?.name
    ).toBe("改名后");
    expect(
      JSON.parse(
        await readFile(
          join(path, "config", "extras-agents", "short-book-analysis.json"),
          "utf8"
        )
      )
    ).toMatchObject({ version: 1 });
  });

  it("allows an empty comparison method but not an empty revision method", async () => {
    const { store } = await createStore();
    const style = await store.save({
      agentId: "style-comparison",
      profiles: [
        {
          id: "default",
          name: "文风比对",
          description: "测试",
          systemPrompt: ""
        }
      ]
    });
    expect(style.profiles[0]?.systemPrompt).toBe("");
    await expect(
      store.save({
        agentId: "revision-analysis",
        profiles: [
          {
            id: "default",
            name: "修改分析",
            description: "测试",
            systemPrompt: " "
          }
        ]
      })
    ).rejects.toThrow();
  });
});
