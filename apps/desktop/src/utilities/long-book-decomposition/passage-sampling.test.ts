import { expect, it } from "vitest";
import { sampleDecompositionPassages } from "./passage-sampling";

it("对白与高潮抽样返回原文的对应位置，随机策略确定且不会越出所选范围", () => {
  const chapters = Array.from({ length: 10 }, (_, i) => ({
    id: `c${i + 1}`,
    order: i + 1,
    title: `第${i + 1}章`,
    sourceName: "合成样书.txt",
    charCount: 20,
    text:
      i === 7
        ? "铺垫。".repeat(100) + "决战时真相揭晓。"
        : i === 4
          ? "前文。".repeat(100) + "“你好。”他问。“你好。”她答。"
          : "合成平静章节。"
  }));
  const dialogue = sampleDecompositionPassages(chapters, "dialogue");
  expect(dialogue[0]!.chapterOrder).toBe(5);
  expect(dialogue[0]!.offset).toBeGreaterThan(0);
  expect(dialogue[0]!.text).toContain("“你好。");
  const climax = sampleDecompositionPassages(chapters, "climax");
  expect(climax[0]!.chapterOrder).toBe(8);
  expect(climax[0]!.text).toContain("真相揭晓");
  for (const sample of [...dialogue, ...climax])
    expect(
      chapters[sample.chapterOrder - 1]!.text.slice(
        sample.offset,
        sample.offset + sample.text.length
      )
    ).toBe(sample.text);
  const selected = chapters.slice(3, 7);
  const random = sampleDecompositionPassages(selected, "random");
  expect(random).toEqual(sampleDecompositionPassages(selected, "random"));
  expect(
    random.every(({ chapterOrder }) => chapterOrder >= 4 && chapterOrder <= 7)
  ).toBe(true);
});
