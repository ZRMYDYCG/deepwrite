import type { BrowserWindow } from "electron";
import type { DeepWriteApi } from "@deepwrite/contracts";

/** Runs "更多功能" agents through the real Preload, Main service and Agent Utility. */
async function extrasAgentSmokeInRenderer() {
  const api = (globalThis as unknown as { deepwrite: DeepWriteApi }).deepwrite;
  const ensure = (condition: unknown, reason: string) => {
    if (!condition) throw new Error(`Extras agent smoke: ${reason}`);
  };

  const style = await api.extrasAgents.profiles.list("style-comparison");
  const method = style.profiles.find((profile) => profile.id === "default");
  ensure(method?.builtin, "built-in comparison method missing");
  const saved = await api.extrasAgents.profiles.save({
    agentId: "style-comparison",
    profiles: [
      {
        id: method!.id,
        name: method!.name,
        description: method!.description,
        systemPrompt: "只比较句式"
      }
    ]
  });
  ensure(
    saved.profiles.find((profile) => profile.id === "default")?.systemPrompt ===
      "只比较句式",
    "saved method was not returned"
  );
  const restored = await api.extrasAgents.profiles.reset(
    "style-comparison",
    "default"
  );
  ensure(
    restored.profiles.find((profile) => profile.id === "default")
      ?.systemPrompt === method!.systemPrompt,
    "reset did not restore the built-in method"
  );

  async function run(
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
          setTimeout(() => reject(new Error("run timed out")), 8_000)
        )
      ]);
      const types = events.map((event) => event.type);
      ensure(!types.includes("agent.error"), "run failed");
      const output = events.find(
        (event) => event.type === "extras_agent.output_updated"
      );
      ensure(output, "no extras output event");
      ensure(
        types.indexOf("extras_agent.output_updated") <
          types.indexOf("agent.message_completed"),
        "output must precede completion"
      );
      return {
        accepted,
        types,
        output: output!.payload.output as Record<string, unknown>
      };
    } finally {
      unsubscribe();
    }
  }

  const comparison = await run({
    sessionId: `smoke_style_${Date.now()}`,
    task: {
      agentId: "style-comparison",
      profileId: "default",
      input: {
        jobId: "smoke_style_job",
        referenceText: "雨停了。街上很静。",
        comparisonText: "风停了。屋里没有声音。"
      }
    }
  });
  ensure(
    comparison.output.kind === "style-comparison-result",
    "no style comparison result"
  );

  const long = await run({
    sessionId: `smoke_long_${Date.now()}`,
    task: {
      agentId: "long-book-analysis",
      profileId: "plot-structure",
      input: {
        jobId: "smoke_long_job",
        unitId: "smoke_long_unit",
        sourceTitle: "冒烟长篇",
        selectionStart: 1,
        selectionEnd: 1,
        phase: "batch",
        segments: [
          {
            id: "segment_1",
            chapterId: "chapter_1",
            chapterOrder: 1,
            chapterTitle: "第一章",
            segmentIndex: 1,
            segmentCount: 1,
            text: "雨夜里，主角收到一封没有署名的信。"
          }
        ]
      }
    }
  });
  ensure(
    long.output.kind === "book-analysis-note" &&
      long.output.unitId === "smoke_long_unit",
    "no long-book note"
  );
  ensure(
    long.types.includes("tool.call_requested"),
    "long-book tools were not called"
  );

  let modelRequired = false;
  try {
    await api.extrasAgents.run({
      sessionId: `smoke_revision_${Date.now()}`,
      task: {
        agentId: "revision-analysis",
        profileId: "default",
        input: {
          jobId: "smoke_revision_job",
          beforeText: "原文",
          afterText: "改文",
          changes: [
            {
              id: "change_1",
              before: "原文",
              after: "改文",
              beforeStart: 0,
              afterStart: 0,
              reason: "",
              coarse: false
            }
          ],
          overallReason: ""
        }
      }
    });
  } catch (error) {
    modelRequired =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "extras_agent.run_failed" &&
      "message" in error &&
      String(error.message).includes("请选择可用模型");
  }
  ensure(modelRequired, "revision analysis ran without a model");

  return {
    status: "ok",
    runtime: comparison.accepted.runtime.mode,
    styleResult: true,
    longNote: true,
    profileRoundTrip: true,
    modelRequired
  };
}

export function runExtrasAgentSmoke(window: BrowserWindow) {
  return window.webContents.executeJavaScript(
    `(${extrasAgentSmokeInRenderer.toString()})()`
  );
}
