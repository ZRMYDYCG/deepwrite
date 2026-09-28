import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readChatProjectConfig,
  saveChatProjectConfig,
  saveChatRole
} from "./chatAssistantProfiles";

afterEach(() => vi.unstubAllGlobals());

function stubProfiles(initial: Record<string, unknown[]>) {
  const stored = structuredClone(initial);
  const save = vi.fn(
    async (input: { agentId: string; profiles: unknown[] }) => {
      stored[input.agentId] = input.profiles;
      return { agentId: input.agentId, profiles: input.profiles };
    }
  );
  vi.stubGlobal("window", {
    deepwrite: {
      extrasAgents: {
        profiles: {
          list: async (agentId: string) => ({
            agentId,
            profiles: structuredClone(stored[agentId] ?? [])
          }),
          save
        }
      }
    }
  });
  return { stored, save };
}

const fallback = {
  id: "default",
  name: "默认项目提示词",
  systemPrompt: "默认提示词。",
  builtin: true
};
const project = { projectType: "short" as const, projectId: "book-1" };

describe("chat assistant profiles", () => {
  it("reads a project's own prompt, or the default one", async () => {
    stubProfiles({
      "chat-project": [
        fallback,
        {
          id: "short:book-1",
          name: "雨夜来信",
          project,
          systemPrompt: "优先核对人物动机。"
        }
      ]
    });
    await expect(readChatProjectConfig(project)).resolves.toEqual({
      project,
      systemPrompt: "优先核对人物动机。",
      customized: true
    });
    await expect(
      readChatProjectConfig({ projectType: "long", projectId: "longbook_a" })
    ).resolves.toMatchObject({
      systemPrompt: "默认提示词。",
      customized: false
    });
  });

  it("saves projects into the unified list and resets them to the default prompt", async () => {
    const { stored, save } = stubProfiles({ "chat-project": [fallback] });
    await expect(
      saveChatProjectConfig(project, "雨夜来信", "优先核对人物动机。")
    ).resolves.toMatchObject({ customized: true });
    expect(stored["chat-project"]).toEqual([
      { id: "default", name: "默认项目提示词", systemPrompt: "默认提示词。" },
      {
        id: "short:book-1",
        name: "雨夜来信",
        project,
        systemPrompt: "优先核对人物动机。"
      }
    ]);
    await expect(
      saveChatProjectConfig(project, "雨夜来信", null)
    ).resolves.toMatchObject({
      systemPrompt: "默认提示词。",
      customized: false
    });
    expect(stored["chat-project"]).toHaveLength(2);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("upserts roles without touching the other roles", async () => {
    const { stored } = stubProfiles({
      "chat-roleplay": [
        { id: "a", name: "守望者", systemPrompt: "你是守望者。" },
        { id: "b", name: "旅人", systemPrompt: "你是旅人。" }
      ]
    });
    await expect(
      saveChatRole({ id: "a", name: "守望者", systemPrompt: "你是老守望者。" })
    ).resolves.toMatchObject({ systemPrompt: "你是老守望者。" });
    await saveChatRole({ id: "c", name: "旅人", systemPrompt: "另一位旅人。" });
    expect(
      (stored["chat-roleplay"] as Array<{ id: string }>).map(({ id }) => id)
    ).toEqual(["a", "b", "c"]);
  });
});
