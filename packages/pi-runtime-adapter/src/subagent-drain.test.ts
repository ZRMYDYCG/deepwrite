import { expect, it, vi } from "vitest";
import { Type } from "typebox";
import type { AgentTool, StreamFn } from "@earendil-works/pi-agent-core";
import {
  createModels,
  fauxProvider,
  fauxAssistantMessage,
  fauxToolCall
} from "@earendil-works/pi-ai";
import {
  buildSpawnSubagentTool,
  isSubagentToolProgressDetails
} from "./subagent-runtime";
import type { SubagentToolProgress } from "./subagent-types";

it.each(["abort", "timeout"] as const)(
  "reports child %s immediately while its parent tool waits for real drainage",
  async (kind) => {
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const childTool: AgentTool = {
      name: "slow_child_tool",
      label: "Slow child tool",
      description: "Fixture ignores cancellation until it finishes.",
      parameters: Type.Object({}),
      async execute() {
        started();
        await slow;
        return { content: [{ type: "text", text: "finished" }], details: {} };
      }
    };
    const faux = fauxProvider({
      api: `child-drain-${kind}`,
      provider: `child-drain-${kind}`,
      models: [{ id: "fixture", name: "Fixture" }],
      tokensPerSecond: 0
    });
    const models = createModels();
    models.setProvider(faux.provider);
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("slow_child_tool", {}), {
        stopReason: "toolUse"
      }),
      fauxAssistantMessage("done")
    ]);
    const model = faux.getModel("fixture")!;
    const controller = new AbortController();
    const progress: SubagentToolProgress[] = [];
    const tool = buildSpawnSubagentTool({
      parentSessionId: "session",
      parentSignal: controller.signal,
      model,
      thinkingLevel: "off",
      streamFn: models.streamSimple.bind(models) as StreamFn,
      definitions: [
        {
          id: "writer",
          name: "Writer",
          description: "Write",
          systemPrompt: "Run the tool.",
          enabled: true,
          modelMode: "inherit"
        }
      ],
      buildChildTools: () => [childTool],
      ...(kind === "timeout" ? { timeoutMs: 20 } : {})
    })!;
    let drained = false;
    const execution = tool
      .execute(
        "spawn",
        { subagent_id: "writer", task: "Run fixture." },
        undefined,
        (update) => {
          if (isSubagentToolProgressDetails(update.details))
            progress.push(update.details.progress);
        }
      )
      .then((result) => {
        drained = true;
        return result;
      });
    try {
      await ready;
      if (kind === "abort") controller.abort();
      await vi.waitFor(() =>
        expect(progress.at(-1)).toMatchObject({
          type: "completed",
          status: kind === "abort" ? "aborted" : "error"
        })
      );
      expect(drained).toBe(false);
      release();
      await execution;
      expect(drained).toBe(true);
      expect(progress.filter((item) => item.type === "completed")).toHaveLength(
        1
      );
    } finally {
      release();
      await execution;
    }
  }
);
