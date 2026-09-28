import { mkdtemp, mkdir, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  decodeLongBookAnalysisText,
  parseLongBookAnalysisTxt,
  readLongBookAnalysisSource
} from "./long-book-source-reader";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "deepwrite-analysis-source-"));
  temporaryDirectories.push(path);
  return path;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("long-book analysis source reader", () => {
  it("recognizes Chinese, English, special and numeric chapter headings", () => {
    const parsed = parseLongBookAnalysisTxt(
      [
        "序章",
        "雨落下来。",
        "第一卷 雾港",
        "第一章来信",
        "她打开信。",
        "Chapter 2 Return",
        "汽笛响起。",
        "3. 追踪",
        "脚步逼近。",
        "番外",
        "多年以后。"
      ].join("\n"),
      "novel.txt"
    );
    expect(parsed.chapters.map((chapter) => chapter.title)).toEqual([
      "序章",
      "第一章 来信",
      "Chapter 2 Return",
      "3 追踪",
      "番外"
    ]);
    expect(parsed.chapters[1]?.volume).toBe("第一卷 雾港");
    expect(parsed.chapters[0]?.text).not.toContain("第一卷");
  });

  it("falls back to one chapter and reports a stable diagnostic", () => {
    const parsed = parseLongBookAnalysisTxt(
      "只有一段没有章号的正文。",
      "plain.txt"
    );
    expect(parsed.chapters).toHaveLength(1);
    expect(parsed.diagnostics[0]?.code).toBe("chapter_heading_not_found");
  });

  it("keeps publication timestamps inside chapter text", () => {
    const parsed = parseLongBookAnalysisTxt(
      [
        "第一章 起点",
        "第一段正文。",
        "2015-03-2313:00:01发表",
        "网页评论内容。",
        "第二章 继续",
        "第二段正文。"
      ].join("\n"),
      "scraped.txt"
    );

    expect(parsed.chapters).toHaveLength(2);
    expect(parsed.chapters[0]?.text).toContain("2015-03-2313:00:01发表");
  });

  it("imports repeated headings without overflowing diagnostics", async () => {
    const root = await temporaryDirectory();
    const path = join(root, "repeated-headings.txt");
    const lines = ["------------", "正文", "------------"];
    for (let index = 1; index <= 1_200; index += 1) {
      lines.push(
        `第${index}章 外层标题`,
        `\uFEFF    第${index}章 正文标题`,
        `这是第${index}章的正文内容。`
      );
    }
    await writeFile(path, lines.join("\n"), "utf8");

    const source = await readLongBookAnalysisSource("txt", path);

    expect(source.chapters).toHaveLength(1_200);
    expect(source.chapters[0]?.title).toBe("第1章 正文标题");
    expect(source.chapters[0]?.text).not.toContain("\uFEFF");
    expect(source.chapters.some((item) => item.title === "正文前内容")).toBe(
      false
    );
    expect(source.diagnostics).toEqual([
      expect.objectContaining({
        code: "empty_headings_skipped",
        message: expect.stringContaining("1,200")
      })
    ]);
  });

  it("decodes UTF-8 BOM and UTF-16 BOM", () => {
    expect(
      decodeLongBookAnalysisText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))
    ).toBe("A");
    expect(
      decodeLongBookAnalysisText(new Uint8Array([0xff, 0xfe, 0x41, 0x00]))
    ).toBe("A");
    expect(
      decodeLongBookAnalysisText(new Uint8Array([0xfe, 0xff, 0x00, 0x41]))
    ).toBe("A");
    expect(
      decodeLongBookAnalysisText(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]))
    ).toBe("中文");
  });

  it("naturally sorts nested chapter files and skips hidden files and symlinks", async () => {
    const root = await temporaryDirectory();
    const volume = join(root, "第一卷");
    await mkdir(volume);
    await writeFile(join(volume, "10.txt"), "第十章正文", "utf8");
    await writeFile(join(volume, "2.md"), "第二章正文", "utf8");
    await writeFile(join(root, ".hidden.txt"), "隐藏", "utf8");
    await symlink(join(volume, "2.md"), join(root, "linked.txt"));

    const source = await readLongBookAnalysisSource("directory", root);
    expect(source.chapters.map((chapter) => chapter.title)).toEqual([
      "2",
      "10"
    ]);
    expect(
      source.chapters.every((chapter) => chapter.volume === "第一卷")
    ).toBe(true);
    expect(
      source.diagnostics.some((item) => item.code === "symbolic_link_skipped")
    ).toBe(true);
  });

  it("rejects one source file above the 25 MiB safety limit", async () => {
    const root = await temporaryDirectory();
    const oversized = join(root, "oversized.txt");
    await writeFile(oversized, "", "utf8");
    await truncate(oversized, 25 * 1024 * 1024 + 1);
    await expect(readLongBookAnalysisSource("txt", oversized)).rejects.toThrow(
      /25 MiB/u
    );
  });
});
