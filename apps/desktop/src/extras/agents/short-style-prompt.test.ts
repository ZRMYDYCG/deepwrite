import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ExtrasAgentConfigStore } from "./config-store";
import { EXTRAS_AGENT_PROFILE_CATALOGS } from "./profile-catalogs";

const previousStylePrompt =
  "你是短篇拆书分析师。分析完整短篇的叙述视角、句式、用词、对白和描写，提炼可执行的写作规则及检查清单。多本输入时比较共性与差异，并标明书名证据。避免大段照抄正文。";

describe("short-book style built-in", () => {
  it("provides a reusable skill prompt for complete stories", async () => {
    const style = EXTRAS_AGENT_PROFILE_CATALOGS[
      "short-book-analysis"
    ].defaults.find((profile) => profile.id === "style")!;
    expect(style.output).toEqual({
      domain: "skill",
      kind: "style",
      stageId: "expert_section_writer"
    });
    expect(style.systemPrompt).toContain("完整正文");
    expect(style.systemPrompt).toContain("【必须贯彻】");
    expect(style.systemPrompt).toContain("write_analysis_result");
    expect(style.systemPrompt).toContain("求婚后在餐厅");
  });

  it("upgrades only the untouched former default prompt", async () => {
    const root = await mkdtemp(join(tmpdir(), "deepwrite-style-profile-"));
    try {
      const path = join(
        root,
        "config",
        "extras-agents",
        "short-book-analysis.json"
      );
      await mkdir(dirname(path), { recursive: true });
      const style = EXTRAS_AGENT_PROFILE_CATALOGS[
        "short-book-analysis"
      ].defaults.find((profile) => profile.id === "style")!;
      await writeFile(
        path,
        JSON.stringify({
          version: 1,
          profiles: [
            { ...style, systemPrompt: previousStylePrompt },
            {
              ...style,
              id: "custom-style",
              name: "自定义文风",
              systemPrompt: "我的自定义文风提示词"
            }
          ]
        }),
        "utf8"
      );
      const store = new ExtrasAgentConfigStore(root);
      expect(
        (await store.list("short-book-analysis")).profiles.map(
          (profile) => profile.id
        )
      ).toContain("custom-style");
      expect(
        (await store.resolve("short-book-analysis", "style")).systemPrompt
      ).toBe(style.systemPrompt.trim());
      expect(
        (await store.resolve("short-book-analysis", "custom-style"))
          .systemPrompt
      ).toBe("我的自定义文风提示词");

      await writeFile(
        path,
        JSON.stringify({
          version: 1,
          profiles: [{ ...style, systemPrompt: "我修改过的官方文风预设" }]
        }),
        "utf8"
      );
      expect(
        (await store.resolve("short-book-analysis", "style")).systemPrompt
      ).toBe("我修改过的官方文风预设");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
