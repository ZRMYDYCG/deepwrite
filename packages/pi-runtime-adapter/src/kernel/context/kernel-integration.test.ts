import { describe, expect, it } from "vitest";
import { PiAgentRuntimeAdapter } from "../../adapter";
import type { AgentRuntimeEvent } from "../../runtime-types";
import { chatNormalTask } from "../../extras/agents/chat.test-support";

const timestamp = new Date().toISOString();
const history = [
  {
    role: "user" as const,
    content: `不使用梦境结局。${"保留人物动机与因果。".repeat(200)}`,
    createdAt: timestamp,
    runId: "earlier"
  },
  {
    role: "assistant" as const,
    content: "已确认这个要求。",
    createdAt: timestamp,
    runId: "earlier"
  }
];
const settings = { enabled: true, budgetTokens: 16_000 };
async function collect(source: AsyncIterable<AgentRuntimeEvent>) {
  const events: AgentRuntimeEvent[] = [];
  for await (const event of source) events.push(event);
  return events;
}

describe("shared compaction kernel integration", () => {
  it("produces a writing checkpoint before completion and restores it in a fresh runtime", async () => {
    const runtime = new PiAgentRuntimeAdapter({
      tokensPerSecond: 0,
      evaluationMode: true
    });
    const events = await collect(
      runtime.start({
        runId: "writing-run",
        sessionId: "writing",
        prompt: "继续设计剧情",
        conversationHistory: history,
        contextCompaction: {},
        contextCompactionSettings: settings
      })
    );
    const compacted = events.find(
      (event) =>
        event.type === "agent.context_compaction" && event.payload.checkpoint
    );
    expect(compacted, JSON.stringify(events)).toBeDefined();
    if (compacted?.type !== "agent.context_compaction") return;
    expect(compacted.payload.checkpoint?.summary).toContain("梦境结局");
    expect(events.indexOf(compacted)).toBeLessThan(
      events.findIndex((event) => event.type === "agent.completed")
    );
    const fresh = new PiAgentRuntimeAdapter({
      tokensPerSecond: 0,
      evaluationMode: true
    });
    const restored = await collect(
      fresh.start({
        runId: "restored",
        sessionId: "writing",
        prompt: "编写正文",
        contextCompactionSettings: settings,
        conversationCheckpoint: compacted.payload.checkpoint!,
        conversationHistory: [
          {
            role: "user",
            content: "继续设计剧情",
            createdAt: timestamp,
            runId: "writing-run"
          }
        ]
      })
    );
    const snapshot = restored.find(
      (event) => event.type === "agent.evaluation_snapshot"
    );
    expect(JSON.stringify(snapshot)).toContain("梦境结局");
    expect(restored.some((event) => event.type === "agent.error")).toBe(false);
  });

  it("applies the same checkpoint protocol to extras chats", async () => {
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });
    const events = await collect(
      runtime.startExtras({
        runId: "chat-run",
        spec: {
          sessionId: "chat",
          task: chatNormalTask(),
          contextCompactionSettings: settings,
          conversation: { message: "继续讨论", history, compaction: {} }
        }
      })
    );
    expect(
      events.some(
        (event) =>
          event.type === "agent.context_compaction" &&
          event.payload.checkpoint?.summary.includes("梦境结局")
      )
    ).toBe(true);
    expect(events.at(-1)?.type).toBe("agent.completed");
  });
});
