import { describe, expect, it } from "vitest";
import {
  buildSubagentAuthoringTools,
  isSubagentAuthoringToolDetails,
  renderSubagentAuthoringSystemPrompt
} from "./subagent-authoring-tools";

const context = {
  parentAgentId: "script" as const,
  parentAgentLabel: "剧本",
  outputMode: "handoff" as const,
  skills: [
    {
      id: "skill:lib1:entry1",
      title: "对白节奏",
      libraryTitle: "文风库",
      body: "对白要短，动作穿插其间。"
    }
  ],
  existingSubagentNames: ["场景检查员"]
};

describe("subagent authoring tools", () => {
  it("renders a system prompt that encodes the user-confirmed output mode", () => {
    const prompt = renderSubagentAuthoringSystemPrompt(context);
    expect(prompt).toContain("只交回结论");
    expect(prompt).toContain("不要调用写入");
    expect(prompt).toContain("对白节奏");
    expect(prompt).toContain("场景检查员");
  });

  it("keeps skill content intact and only reworks the output and handoff section", () => {
    const prompt = renderSubagentAuthoringSystemPrompt(context);
    expect(prompt).toContain("不要改动技能的主要内容");
    expect(prompt).toContain("只允许规范格式");
    expect(prompt).toContain("## 技能：技能标题");
    expect(prompt).toContain("## 输出与交接");
    expect(prompt).toContain("唯一需要你改写的部分");
    expect(prompt).not.toContain("改写成适合子智能体执行");
    expect(prompt).not.toContain("去掉对用户对话口吻");
  });

  it("ties the confirmed output mode to the output and handoff section", () => {
    const write = renderSubagentAuthoringSystemPrompt({
      ...context,
      outputMode: "write"
    });
    expect(write).toContain("「输出与交接」一节必须明确要求：先读后写");
    expect(write).not.toContain("不要调用写入 / 替换工具");
    const handoff = renderSubagentAuthoringSystemPrompt(context);
    expect(handoff).toContain("「输出与交接」一节必须明确要求：可读工具");
  });

  it("exposes read and draft tools and emits a draft update", async () => {
    const tools = buildSubagentAuthoringTools(context);
    expect(tools.map((tool) => tool.name)).toEqual([
      "list_authoring_skills",
      "read_authoring_skill",
      "write_subagent_draft"
    ]);

    const read = tools.find((tool) => tool.name === "read_authoring_skill");
    const write = tools.find((tool) => tool.name === "write_subagent_draft");
    expect(read && write).toBeTruthy();

    const readResult = await read!.execute("call_read", {
      skill_id: "skill:lib1:entry1"
    });
    expect(readResult.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("对白要短")
    });

    const writeResult = await write!.execute("call_write", {
      name: "对白助手",
      description: "处理对白节奏问题。",
      system_prompt: "你只审阅对白，把问题交回主智能体。"
    });
    expect(isSubagentAuthoringToolDetails(writeResult.details)).toBe(true);
    if (isSubagentAuthoringToolDetails(writeResult.details)) {
      expect(writeResult.details.draft.name).toBe("对白助手");
    }
  });
});
