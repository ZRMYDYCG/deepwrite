import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { BrowserWindow } from "electron";
import { dialog } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  combinedLongManuscriptText,
  exportLongManuscript,
  safeLongExportName,
  writeLongManuscriptExport
} from "./long-manuscript-export";

vi.mock("electron", () => ({
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn()
  }
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("long manuscript folder export", () => {
  it("uses display labels, creates list folders, and resolves duplicate names", async () => {
    const parent = await mkdtemp(join(tmpdir(), "deepwrite-long-export-"));
    temporaryDirectories.push(parent);
    const result = await writeLongManuscriptExport(parent, {
      title: "雾港:/长篇",
      sections: ["worldbuilding", "manuscript"],
      files: [
        { path: ["世界观", "势力", "巡夜司"], content: "第一份设定" },
        { path: ["世界观", "势力", "巡夜司"], content: "第二份设定" },
        { path: ["正文", "第一节"], content: "正文内容" }
      ]
    });

    expect(result.fileCount).toBe(3);
    expect(result.directoryPath).toContain("雾港 长篇-导出");
    expect(
      (await readdir(join(result.directoryPath, "世界观", "势力"))).sort()
    ).toEqual(["巡夜司 (2).txt", "巡夜司.txt"]);
    expect(
      await readFile(join(result.directoryPath, "正文", "第一节.txt"), "utf8")
    ).toBe("\ufeff正文内容");
  });

  it("sanitizes reserved and unsafe filename characters", () => {
    expect(safeLongExportName('  第一节:/\\*?<>|" ...  ')).toBe("第一节");
    expect(safeLongExportName("CON", "备用名")).toBe("备用名");
  });
});

describe("long manuscript single-file export", () => {
  it("merges selected entries in order with their visible headings", () => {
    const text = combinedLongManuscriptText({
      title: "雾港",
      mode: "single-txt",
      sections: ["worldbuilding", "manuscript"],
      files: [
        { path: ["世界观", "势力", "巡夜司"], content: "设定内容\n" },
        { path: ["正文", "第一章"], content: "第一章正文\n" },
        { path: ["正文", "第二章"], content: "第二章正文" }
      ]
    });

    expect(text).toBe(
      "\ufeff雾港\n\n【世界观】\n\n〔势力 / 巡夜司〕\n\n设定内容\n\n" +
        "【正文】\n\n〔第一章〕\n\n第一章正文\n\n〔第二章〕\n\n第二章正文\n"
    );
  });

  it("saves one TXT file at the selected path", async () => {
    const parent = await mkdtemp(join(tmpdir(), "deepwrite-long-export-"));
    temporaryDirectories.push(parent);
    const filePath = join(parent, "雾港.txt");
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: false,
      filePath
    });

    const result = await exportLongManuscript({} as BrowserWindow, {
      title: "雾港",
      mode: "single-txt",
      sections: ["manuscript"],
      files: [{ path: ["正文", "第一章"], content: "正文" }]
    });

    expect(dialog.showSaveDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ defaultPath: "雾港.txt" })
    );
    expect(result).toEqual({ status: "saved", filePath, fileCount: 1 });
    expect(await readFile(filePath, "utf8")).toBe(
      "\ufeff雾港\n\n【正文】\n\n〔第一章〕\n\n正文\n"
    );
  });
});
