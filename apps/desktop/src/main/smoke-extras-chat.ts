import type { BrowserWindow } from "electron";
import type { DeepWriteApi } from "@deepwrite/contracts";

/** Runs the "更多功能" chat agents through Preload, Main and the Agent Utility. */
async function extrasChatSmokeInRenderer() {
  const api = (globalThis as unknown as { deepwrite: DeepWriteApi }).deepwrite;
  const ensure = (condition: unknown, reason: string) => {
    if (!condition) throw new Error(`Extras chat smoke: ${reason}`);
  };

  async function turn(
    request: Parameters<DeepWriteApi["extrasAgents"]["run"]>[0]
  ) {
    const events: Array<{ type: string; payload: Record<string, unknown> }> =
      [];
    let settle!: () => void;
    const terminal = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const unsubscribe = api.events.subscribe((event) => {
      const payload = event.payload as Record<string, unknown>;
      if (payload.sessionId !== request.sessionId) return;
      events.push({ type: event.type, payload });
      if (
        event.type === "agent.message_completed" ||
        event.type === "agent.error"
      )
        settle();
    });
    try {
      const accepted = await api.extrasAgents.run(request);
      await Promise.race([
        terminal,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("chat turn timed out")), 8_000)
        )
      ]);
      const completed = events.find(
        (event) => event.type === "agent.message_completed"
      );
      ensure(completed, "chat turn did not complete");
      return {
        accepted,
        content: String(completed!.payload.content ?? "")
      };
    } finally {
      unsubscribe();
    }
  }

  const sessionId = `smoke_chat_${Date.now()}`;
  const normal = {
    agentId: "chat-normal" as const,
    profileId: "default",
    input: {}
  };
  const first = await turn({
    sessionId,
    task: normal,
    conversation: { message: "你好，冒烟聊天" }
  });
  ensure(first.content.includes("你好，冒烟聊天"), "normal chat reply");
  const second = await turn({
    sessionId,
    task: normal,
    conversation: {
      message: "继续",
      history: [
        {
          role: "user",
          content: "你好，冒烟聊天",
          createdAt: first.accepted.acceptedAt
        },
        {
          role: "assistant",
          content: first.content,
          createdAt: first.accepted.acceptedAt
        }
      ]
    }
  });
  ensure(second.content.includes("继续"), "follow-up chat reply");

  const roleId = `smoke_role_${Date.now()}`;
  const roles = await api.extrasAgents.profiles.save({
    agentId: "chat-roleplay",
    profiles: [{ id: roleId, name: "冒烟守望者", systemPrompt: "你是守望者。" }]
  });
  ensure(
    roles.profiles.some((profile) => profile.id === roleId),
    "role was not saved"
  );
  const roleplay = await turn({
    sessionId: `smoke_roleplay_${Date.now()}`,
    task: { agentId: "chat-roleplay", profileId: roleId, input: {} },
    conversation: { message: "你好" }
  });
  ensure(roleplay.content.includes("人物扮演"), "roleplay reply");

  let projectRejected = false;
  try {
    await api.extrasAgents.run({
      sessionId: `smoke_project_${Date.now()}`,
      task: {
        agentId: "chat-project",
        profileId: "short:smoke_missing",
        input: { project: { projectType: "short", projectId: "smoke_missing" } }
      },
      conversation: { message: "项目里有什么？" }
    });
  } catch (error) {
    projectRejected =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "extras_agent.run_failed" &&
      "message" in error &&
      String(error.message).includes("所选创作项目不存在");
  }
  ensure(projectRejected, "missing project was not rejected by Main");

  return {
    status: "ok",
    runtime: first.accepted.runtime.mode,
    turns: 2,
    roleplay: true,
    projectRejected
  };
}

export function runExtrasChatSmoke(window: BrowserWindow) {
  return window.webContents.executeJavaScript(
    `(${extrasChatSmokeInRenderer.toString()})()`
  );
}
