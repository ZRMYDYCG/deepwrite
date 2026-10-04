import { createDecompositionTrialDiagnostics } from "./smoke-decomposition-trial-diagnostic";
import { decompositionSmokeInRenderer } from "./smoke-long-book-decomposition-renderer";
import type { BrowserWindow } from "electron";
import { CommandEnvelopeSchema, createEnvelope } from "@deepwrite/contracts";
import type { UtilitySupervisor } from "./supervisor";

export async function runLongBookDecompositionSmoke(
  window: BrowserWindow,
  supervisor: UtilitySupervisor
) {
  const workspaceDirectory = (await window.webContents.executeJavaScript(
    "window.deepwrite.workspaceDirectory.list().then(value => value.path)"
  )) as string;
  const source = {
    id: "long_book_analysis_source_smoke_decomposition",
    name: "冒烟自写样书",
    kind: "txt",
    diagnostics: [],
    chapters: [
      "主角与人物1在雨夜找到铜铃，伏笔1埋设。",
      "人物1说：‘铜铃来自旧城。’主角踏上旅途。",
      "主角在决战后找到真相，伏笔1回收。"
    ].map((text, index) => ({
      id: `smoke_source_chapter_${index + 1}`,
      title: `第${index + 1}章`,
      order: index + 1,
      volume: "第一卷",
      text,
      charCount: text.length,
      sourceName: "自写样书.txt"
    }))
  };
  const saved = await supervisor.requestCommand(
    "core",
    CommandEnvelopeSchema.parse(
      createEnvelope(
        "longBookAnalysis.coreSource",
        { workspaceDirectory, operation: "import", source },
        { id: "smoke_decomposition_source" }
      )
    )
  );
  if (saved.status === "rejected") throw new Error(saved.error.message);
  const realModel =
    process.env.DEEPWRITE_SMOKE_SUITE === "decomposition-real-model";
  try {
    return await window.webContents.executeJavaScript(
      `(${decompositionSmokeInRenderer.toString()})(${createDecompositionTrialDiagnostics.toString()},${realModel},${JSON.stringify(process.env.DEEPWRITE_DECOMPOSITION_TRIAL_MODEL_ID)})`
    );
  } catch (error) {
    if (realModel) {
      const diagnostic = await window.webContents.executeJavaScript(
        "globalThis.decompositionTrialDiagnostic"
      );
      console.error(`DECOMP_TRIAL_DIAGNOSTIC ${JSON.stringify(diagnostic)}`);
    }
    throw new Error(
      typeof error === "string"
        ? error
        : error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "Renderer 拆解冒烟失败。"
    );
  }
}
