import { expect, it } from "vitest";
import { Type } from "typebox";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { AgentUserInputBroker } from "../user-input-broker";
import type { AgentRuntimeEvent } from "../runtime-types";
import { ConversationAgentCache } from "./run-agent";
import { AgentRunKernel } from "./run-kernel";

it.each(["resolve", "reject"] as const)(
  "keeps aborted execution owned until a slow tool really %ss",
  async (result) => {
    let release!: () => void;
    let fail!: (error: Error) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const slow = new Promise<void>((resolve, reject) => {
      release = resolve;
      fail = reject;
    });
    const tool: AgentTool = {
      name: "slow_tool",
      label: "Slow tool",
      description:
        "A fixture that ignores cancellation until its work finishes.",
      parameters: Type.Object({}),
      async execute() {
        started();
        await slow;
        return { content: [{ type: "text", text: "finished" }], details: {} };
      }
    };
    const agents = new ConversationAgentCache(new Map(), {});
    const runtime = {
      mode: "local-faux" as const,
      provider: "example",
      model: "fixture"
    };
    const kernel = new AgentRunKernel({
      agents,
      userInputBroker: new AgentUserInputBroker(),
      idleTimeoutMs: 0,
      tokensPerSecond: 0,
      evaluationMode: false,
      retryPolicy: { delaysMs: [] },
      describe: () => runtime
    });
    const controller = new AbortController();
    const events: AgentRuntimeEvent[] = [];
    let drained = false;
    const execution = (async () => {
      for await (const event of kernel.run({
        target: {
          runId: "run",
          sessionId: "session",
          signal: controller.signal
        },
        eventSource: { runId: "run", sessionId: "session" },
        agentKey: "conversation",
        portableToolSchemaProfile: "default",
        build: () => ({ systemPrompt: "Run the fixture.", tools: [tool] }),
        userMessageContent: () => "Run the tool.",
        fauxResponses: () => [
          fauxAssistantMessage(fauxToolCall("slow_tool", {}), {
            stopReason: "toolUse"
          }),
          fauxAssistantMessage("done")
        ]
      }))
        events.push(event);
      drained = true;
    })();
    try {
      await ready;
      controller.abort();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(events.at(-1)).toMatchObject({
        type: "agent.error",
        payload: { code: "pi_agent.aborted" }
      });
      expect(drained).toBe(false);
      expect(agents.agents.get("conversation")?.state.isStreaming).toBe(true);
      if (result === "reject") fail(new Error("Fixture failed after abort."));
      else release();
      await execution;
      expect(drained).toBe(true);
      expect(agents.agents.get("conversation")?.state.isStreaming).toBe(false);
      expect(
        events.filter((event) => event.type === "agent.error")
      ).toHaveLength(1);
    } finally {
      release();
      await execution;
    }
  }
);
