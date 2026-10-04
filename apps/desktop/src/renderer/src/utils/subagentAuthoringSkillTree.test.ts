import type { SkillLibrary } from "@deepwrite/contracts/renderer";
import { describe, expect, it } from "vitest";
import {
  allSkillTreeKeys,
  buildSkillTree,
  buildSubagentAuthoringSkillOptions,
  defaultExpandedSkillTreeKeys
} from "./subagentAuthoringSkillTree";

function library(
  id: string,
  entries: { id: string; title: string; stageId: string; body?: string }[]
): SkillLibrary {
  return {
    id,
    title: `库 ${id}`,
    skillType: "short",
    skillKind: "general",
    overview: "",
    isBuiltin: id === "a",
    entries: entries.map((entry) => ({
      ...entry,
      body: entry.body ?? "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    })),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  } as SkillLibrary;
}

const labels: Record<string, string> = {
  character_design: "角色技能",
  plot_design: "剧情技能",
  outline: "大纲技能",
  draft: "正文写作技能",
  expert_section_writer: "分段写作技能"
};
const stageLabel = (stageId: string) => labels[stageId] ?? stageId;

const options = buildSubagentAuthoringSkillOptions([
  library("a", [
    { id: "e1", title: "逻辑审查", stageId: "plot_design" },
    { id: "e2", title: "人物小传", stageId: "character_design" },
    { id: "e3", title: "剧情转折", stageId: "plot_design" }
  ]),
  library("b", [{ id: "e4", title: "大纲整理", stageId: "outline" }]),
  library("empty", [])
]);

describe("subagent authoring skill tree", () => {
  it("flattens libraries into stable skill ids with library context", () => {
    expect(options.map((option) => option.id)).toEqual([
      "skill:a:e1",
      "skill:a:e2",
      "skill:a:e3",
      "skill:b:e4"
    ]);
    expect(options[0]).toMatchObject({
      libraryId: "a",
      entryId: "e1",
      libraryBuiltin: true,
      libraryKind: "general"
    });
  });

  it("groups by library then stage in canonical stage order and drops empty groups", () => {
    const tree = buildSkillTree(options, "", stageLabel);
    expect(tree.map((node) => [node.libraryId, node.count])).toEqual([
      ["a", 3],
      ["b", 1]
    ]);
    expect(tree[0]!.stages.map((stage) => stage.stageId)).toEqual([
      "character_design",
      "plot_design"
    ]);
    expect(tree[0]!.stages[1]!.skills.map((skill) => skill.title)).toEqual([
      "逻辑审查",
      "剧情转折"
    ]);
  });

  it("filters by skill title, library title or stage label", () => {
    const byTitle = buildSkillTree(options, " 转折 ", stageLabel);
    expect(byTitle.map((node) => node.count)).toEqual([1]);
    expect(buildSkillTree(options, "库 b", stageLabel)[0]!.libraryId).toBe("b");
    const byStage = buildSkillTree(options, "角色", stageLabel);
    expect(byStage[0]!.stages.map((stage) => stage.stageId)).toEqual([
      "character_design"
    ]);
    expect(buildSkillTree(options, "不存在", stageLabel)).toEqual([]);
  });

  it("opens small trees fully and large trees only at the first library", () => {
    const small = buildSkillTree(options, "", stageLabel);
    expect(defaultExpandedSkillTreeKeys(small)).toEqual(
      allSkillTreeKeys(small)
    );

    const many = buildSubagentAuthoringSkillOptions([
      library(
        "a",
        Array.from({ length: 12 }, (_, index) => ({
          id: `x${index}`,
          title: `技能 ${index}`,
          stageId: "draft"
        }))
      ),
      library(
        "b",
        Array.from({ length: 12 }, (_, index) => ({
          id: `y${index}`,
          title: `技能 ${index}`,
          stageId: "draft"
        }))
      )
    ]);
    const large = buildSkillTree(many, "", stageLabel);
    const expanded = defaultExpandedSkillTreeKeys(large);
    expect(expanded.has("library:a")).toBe(true);
    expect(expanded.has("stage:a:draft")).toBe(true);
    expect(expanded.has("library:b")).toBe(false);
  });
});
