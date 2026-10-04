import { describe, expect, it } from "vitest";
import { CoverLayoutSchema } from "@deepwrite/contracts/renderer";
import { coverTextBlocks, type CoverTextBlock } from "./cover-compose";

const templates = [
  "top-center",
  "bottom-horizontal",
  "right-vertical",
  "center-overlay",
  "top-left",
  "top-right",
  "center-left",
  "center-right",
  "bottom-left",
  "bottom-right",
  "left-vertical"
] as const;
const dimensions = [
  [864, 1536],
  [1080, 1440],
  [1024, 1024],
  [1536, 864],
  [90, 160]
] as const;
const measure = (text: string, size: number) =>
  Array.from(text).reduce(
    (width, char) => width + (char === "W" ? 1.5 : 1) * size,
    0
  );
const base = CoverLayoutSchema.parse({
  template: "top-center",
  title: "长夜将明",
  fontFamily: "serif",
  color: "#ffffff",
  fontSize: 90,
  subtitle: "重生之后",
  author: "测试作者"
});

function assertSafe(blocks: CoverTextBlock[], width: number, height: number) {
  for (const [index, block] of blocks.entries()) {
    const textWidth = measure(block.text, block.size);
    const left =
      block.align === "left"
        ? block.x
        : block.align === "right"
          ? block.x - textWidth
          : block.x - textWidth / 2;
    expect(left).toBeGreaterThanOrEqual(width * 0.08 - 0.01);
    expect(left + textWidth).toBeLessThanOrEqual(width * 0.92 + 0.01);
    expect(block.y).toBeGreaterThanOrEqual(height * 0.1 - 0.01);
    expect(block.y + block.size).toBeLessThanOrEqual(height * 0.92 + 0.01);
    expect(block.size).toBeGreaterThan(0);
    if (index > 0) {
      const previous = blocks[index - 1]!;
      expect(block.y).toBeGreaterThanOrEqual(previous.y + previous.size - 0.01);
    }
  }
}

describe("cover text layout", () => {
  it.each(templates)(
    "accepts and safely composes the %s template",
    (template) => {
      const layout = CoverLayoutSchema.parse({ ...base, template });
      for (const [width, height] of dimensions) {
        const blocks = coverTextBlocks(width, height, layout, measure);
        expect(blocks.map((block) => block.text).join("")).toBe(
          layout.title + layout.subtitle + layout.author
        );
        assertSafe(blocks, width, height);
      }
    }
  );

  it.each(templates)(
    "preserves maximum-length text without collisions in the %s template",
    (template) => {
      const layout = CoverLayoutSchema.parse({
        ...base,
        template,
        fontSize: 1000,
        title: "长W".repeat(60),
        subtitle: "副标题W".repeat(50),
        author: "作者W".repeat(40)
      });
      for (const [width, height] of dimensions) {
        const blocks = coverTextBlocks(width, height, layout, measure);
        expect(blocks.map((block) => block.text).join("")).toBe(
          layout.title + layout.subtitle + layout.author
        );
        assertSafe(blocks, width, height);
      }
    }
  );

  it.each([
    ["top-left", "left"],
    ["center-left", "left"],
    ["bottom-left", "left"],
    ["top-right", "right"],
    ["center-right", "right"],
    ["bottom-right", "right"],
    ["top-center", "center"],
    ["center-overlay", "center"],
    ["bottom-horizontal", "center"]
  ] as const)(
    "aligns the title and subtitle together for %s",
    (template, align) => {
      const blocks = coverTextBlocks(
        1080,
        1440,
        { ...base, template },
        measure
      );
      expect(blocks.slice(0, -1).every((block) => block.align === align)).toBe(
        true
      );
      expect(blocks.at(-1)!.align).toBe("center");
    }
  );

  it("positions complete text groups at the top, middle and bottom", () => {
    const positions = ["top-left", "center-left", "bottom-left"].map(
      (template) =>
        coverTextBlocks(
          1080,
          1440,
          { ...base, template: template as typeof base.template },
          measure
        )[0]!.y
    );
    expect(positions[0]).toBeLessThan(positions[1]!);
    expect(positions[1]).toBeLessThan(positions[2]!);
  });

  it("places vertical titles on the selected side with a readable subtitle below", () => {
    const layout = {
      ...base,
      title: "长".repeat(120),
      subtitle: "副".repeat(200)
    };
    const left = coverTextBlocks(
      864,
      1536,
      { ...layout, template: "left-vertical" },
      measure
    );
    const right = coverTextBlocks(
      864,
      1536,
      { ...layout, template: "right-vertical" },
      measure
    );
    expect(left[0]!.x).toBeLessThan(864 / 2);
    expect(right[0]!.x).toBeGreaterThan(864 / 2);
    expect(left.filter((block) => block.text === "长")).toHaveLength(120);
    expect(left[120]!.size).toBeGreaterThan(left[0]!.size);
    assertSafe(left, 864, 1536);
    assertSafe(right, 864, 1536);
  });

  it.each(templates)("supports empty text fields for %s", (template) => {
    expect(
      coverTextBlocks(
        600,
        800,
        {
          ...base,
          template,
          title: "",
          subtitle: "",
          author: ""
        },
        measure
      )
    ).toEqual([]);
    const blocks = coverTextBlocks(
      600,
      800,
      { ...base, template, title: "" },
      measure
    );
    expect(blocks.map((block) => block.text).join("")).toBe(
      base.subtitle + base.author
    );
    assertSafe(blocks, 600, 800);
  });
});
