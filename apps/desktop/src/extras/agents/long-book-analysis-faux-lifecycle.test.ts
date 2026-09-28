import {
  LongBookAnalysisPresetSchema,
  type LongBookAnalysisNote,
  type LongBookAnalysisResult,
  type LongBookAnalysisRuntimeContext
} from "@deepwrite/contracts";
import {
  PiAgentRuntimeAdapter,
  type AgentRuntimeEvent
} from "@deepwrite/pi-runtime-adapter";
import { describe, expect, it, vi } from "vitest";
import { EXTRAS_AGENT_PROFILE_CATALOGS } from "./profile-catalogs";
import { parseLongBookAnalysisTxt } from "./sources/long-book-source-reader";

const profile = LongBookAnalysisPresetSchema.parse(
  EXTRAS_AGENT_PROFILE_CATALOGS["long-book-analysis"].defaults[0]
);

function baseContext(unitId: string) {
  return {
    jobId: "faux-lifecycle-job",
    unitId,
    sourceTitle: "四章测试长篇.txt",
    selectionStart: 1,
    selectionEnd: 4
  } as const;
}

async function runFauxUnit(
  runtime: PiAgentRuntimeAdapter,
  context: LongBookAnalysisRuntimeContext,
  sessions: string[]
): Promise<AgentRuntimeEvent[]> {
  const sessionId = `session-${context.unitId}`;
  sessions.push(sessionId);
  const events: AgentRuntimeEvent[] = [];
  for await (const event of runtime.startExtras({
    runId: `run-${context.unitId}`,
    spec: {
      sessionId,
      task: { agentId: "long-book-analysis", profile, input: context }
    }
  })) {
    events.push(event);
  }
  expect(events.some((event) => event.type === "agent.completed")).toBe(true);
  expect(events.some((event) => event.type === "subagent.activity")).toBe(
    false
  );
  return events;
}

function noteFrom(
  events: readonly AgentRuntimeEvent[],
  context: LongBookAnalysisRuntimeContext,
  chapterStart: number,
  chapterEnd: number
): LongBookAnalysisNote {
  for (const event of events) {
    if (
      event.type === "extras_agent.output_updated" &&
      event.payload.output.kind === "book-analysis-note" &&
      event.payload.output.unitId === context.unitId
    ) {
      return {
        id: `note-${context.unitId}`,
        label: `${context.phase}-${context.unitId}`,
        chapterStart,
        chapterEnd,
        text: event.payload.output.note.text
      };
    }
  }
  throw new Error("Faux Runtime did not write an analysis note.");
}

function resultFrom(
  events: readonly AgentRuntimeEvent[]
): LongBookAnalysisResult {
  for (const event of events) {
    if (
      event.type === "extras_agent.output_updated" &&
      event.payload.output.kind === "book-analysis-result"
    ) {
      return event.payload.output.result;
    }
  }
  throw new Error("Faux Runtime did not write an analysis result.");
}

describe("long-book analysis Faux lifecycle", () => {
  it("imports chapters, recursively reduces batches, edits the preview, and creates a new entry", async () => {
    const parsed = parseLongBookAnalysisTxt(
      [
        "第一章 来信",
        "雨夜里，主角收到一封没有署名的信。",
        "第二章 追查",
        "主角沿着信上的地址追查，却发现证人失踪。",
        "第三章 反转",
        "失踪的证人主动现身，并指出真正的幕后目标。",
        "第四章 选择",
        "主角放弃安全退路，决定公开证据并承担代价。"
      ].join("\n"),
      "四章测试长篇.txt"
    );
    expect(parsed.chapters).toHaveLength(4);

    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });
    const sessions: string[] = [];
    const batchNotes: LongBookAnalysisNote[] = [];
    for (const chapter of parsed.chapters) {
      const context: LongBookAnalysisRuntimeContext = {
        ...baseContext(`batch-${chapter.order}`),
        phase: "batch",
        segments: [
          {
            id: `segment-${chapter.order}`,
            chapterId: chapter.id,
            chapterOrder: chapter.order,
            chapterTitle: chapter.title,
            ...(chapter.volume ? { volume: chapter.volume } : {}),
            segmentIndex: 1,
            segmentCount: 1,
            text: chapter.text
          }
        ]
      };
      batchNotes.push(
        noteFrom(
          await runFauxUnit(runtime, context, sessions),
          context,
          chapter.order,
          chapter.order
        )
      );
    }

    const firstReductionNotes: LongBookAnalysisNote[] = [];
    for (let index = 0; index < batchNotes.length; index += 2) {
      const inputs = batchNotes.slice(index, index + 2);
      const context: LongBookAnalysisRuntimeContext = {
        ...baseContext(`reduce-pair-${index / 2 + 1}`),
        phase: "reduce",
        notes: inputs
      };
      firstReductionNotes.push(
        noteFrom(
          await runFauxUnit(runtime, context, sessions),
          context,
          inputs[0]!.chapterStart,
          inputs.at(-1)!.chapterEnd
        )
      );
    }

    const recursiveContext: LongBookAnalysisRuntimeContext = {
      ...baseContext("reduce-recursive"),
      phase: "reduce",
      notes: firstReductionNotes
    };
    const finalNote = noteFrom(
      await runFauxUnit(runtime, recursiveContext, sessions),
      recursiveContext,
      1,
      4
    );
    const finalContext: LongBookAnalysisRuntimeContext = {
      ...baseContext("final"),
      phase: "final",
      notes: [finalNote]
    };
    const generated = resultFrom(
      await runFauxUnit(runtime, finalContext, sessions)
    );

    const edited = {
      ...generated,
      content: `${generated.content}\n\n## 用户校正\n\n保留这条可迁移结构。`
    };
    const createLibraryEntry = vi.fn(
      async (_input: Record<string, unknown>) => ({ id: "entry-1" })
    );
    await createLibraryEntry({
      domain: profile.output.domain,
      libraryId: "plot-library",
      title: edited.name,
      content: edited.content,
      stageId: profile.output.stageId
    });

    expect(firstReductionNotes).toHaveLength(2);
    expect(new Set(sessions).size).toBe(8);
    expect(edited.content).toContain("用户校正");
    expect(createLibraryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "material",
        stageId: "pacing",
        content: expect.stringContaining("用户校正")
      })
    );
  });
});
