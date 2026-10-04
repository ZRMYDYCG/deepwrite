import { describe, expect, it, vi } from "vitest";
import {
  SystemEventEnvelopeSchema,
  type SubagentDrawSettings,
  type SystemEventEnvelope
} from "@deepwrite/contracts";
import { createDrawRunFixture } from "../../../../packages/pi-runtime-adapter/src/subagent-draw.test-support";
import { AgentRunRegistry } from "./agent-run-registry";

const runtime = {
  provider: "deepwrite",
  model: "deepwrite-writing-faux",
  mode: "local-faux" as const
};

async function startDraw(selection: SubagentDrawSettings["selection"]) {
  const runs = new AgentRunRegistry();
  const sessionId = "draw-session";
  const { runId, signal } = runs.begin(sessionId, false);
  const fixture = createDrawRunFixture({
    sessionId,
    runId,
    signal,
    runtime,
    selection
  });

  const events: SystemEventEnvelope[] = [];
  runs.stream(
    { sessionId, runId, runtime, promptRequestId: "draw-command" },
    fixture.events,
    "draw-command",
    (rawEvent) => {
      // This is the same validation performed before Utility posts to Main.
      const event = SystemEventEnvelopeSchema.parse(rawEvent);
      events.push(event);
    }
  );
  return { runs, events, submit: fixture.resolveUserInput };
}

describe("draw selection across the runtime and Utility event boundary", () => {
  it.each(["manual", "auto"] as const)(
    "delivers all candidates in %s mode and returns only the user's selection to the parent",
    async (selection) => {
      const { runs, events, submit } = await startDraw(selection);
      try {
        await vi.waitFor(() =>
          expect(
            events.some((event) =>
              ["agent.user_input_requested", "agent.error"].includes(event.type)
            )
          ).toBe(true)
        );
        expect(
          events.find((event) => event.type === "agent.error")
        ).toBeUndefined();
        const request = events.find(
          (event) => event.type === "agent.user_input_requested"
        )!.payload;
        expect(request).toMatchObject({
          source: "subagent_draw",
          draw: { name: "标题助手", task: "起标题", count: 3 }
        });
        const candidates = request.draw!.candidates;
        expect(candidates.map((candidate) => candidate.text)).toEqual([
          "标题甲",
          "标题乙",
          "标题丙"
        ]);
        expect(candidates.map((candidate) => candidate.id)).toEqual([
          "c1",
          "c2",
          "c3"
        ]);
        if (selection === "auto") {
          expect(request.draw!.fallbackReason).toContain("已改为手动选择");
        } else {
          expect(request.draw!.fallbackReason).toBeUndefined();
        }
        expect(
          events.flatMap((event) =>
            event.type === "subagent.completed" &&
            event.payload.draw?.role === "candidate"
              ? [event.payload.status]
              : []
          )
        ).toEqual(["completed", "completed", "completed"]);
        expect(
          events.some((event) => event.type === "agent.message_completed")
        ).toBe(false);

        expect(
          submit({
            sessionId: request.sessionId,
            runId: request.runId,
            requestId: request.requestId,
            answers: [
              { id: "draw", selectedOptionIds: ["c2"], text: "结尾再短一点" }
            ]
          })
        ).toMatchObject({ requestId: request.requestId });
        await vi.waitFor(() =>
          expect(events.at(-1)?.type).toBe("agent.run_drained")
        );

        const handoff = events.find(
          (event) =>
            event.type === "tool.execution_completed" &&
            event.payload.toolName === "spawn_subagent"
        );
        expect(handoff).toMatchObject({
          payload: {
            isError: false,
            resultSummary: expect.stringContaining("用户选择第 2 份")
          }
        });
        if (handoff?.type !== "tool.execution_completed")
          throw new Error("Missing handoff.");
        expect(handoff.payload.resultSummary).toContain(candidates[1]!.text);
        expect(handoff.payload.resultSummary).toContain(
          "用户附言：结尾再短一点"
        );
        expect(handoff.payload.resultSummary).not.toContain(
          candidates[0]!.text
        );
        expect(handoff.payload.resultSummary).not.toContain(
          candidates[2]!.text
        );
        expect(
          events.find(
            (event) =>
              event.type === "subagent.draw_updated" &&
              event.payload.phase === "selected"
          )?.payload
        ).toMatchObject({
          phase: "selected",
          selectedBy: "user",
          selectedIndex: 1,
          selectedSubagentRunId: candidates[1]!.subagentRunId
        });
        expect(
          events.some((event) => event.type === "agent.message_completed")
        ).toBe(true);
        expect(events.some((event) => event.type === "agent.error")).toBe(
          false
        );
      } finally {
        await runs.shutdown();
      }
    }
  );
});
