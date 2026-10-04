import type { CoverLayout } from "@deepwrite/contracts/renderer";
export interface CoverTextBlock {
  text: string;
  x: number;
  y: number;
  size: number;
  align: CanvasTextAlign;
}
type MeasureText = (text: string, size: number) => number;
interface TextRows {
  lines: string[];
  size: number;
  height: number;
}
const lineSpacing = 1.25;

function wrapText(
  text: string,
  size: number,
  width: number,
  measure: MeasureText
) {
  const lines: string[] = [];
  let line = "";
  for (const char of Array.from(text)) {
    if (line && measure(line + char, size) > width) {
      lines.push(line);
      line = char;
    } else line += char;
  }
  if (line) lines.push(line);
  return lines;
}
function fitRows(
  text: string,
  initialSize: number,
  width: number,
  height: number,
  maxLines: number,
  measure: MeasureText
): TextRows {
  const rows = (size: number): TextRows => {
    const lines = wrapText(text, size, width, measure);
    return {
      lines,
      size,
      height: lines.length ? size * (1 + (lines.length - 1) * lineSpacing) : 0
    };
  };
  const fits = (value: TextRows) =>
    value.lines.length <= maxLines &&
    value.height <= height &&
    value.lines.every((line) => measure(line, value.size) <= width);
  let result = rows(initialSize);
  if (fits(result)) return result;
  let low = 0,
    high = initialSize;
  for (let i = 0; i < 24; i++) {
    const middle = (low + high) / 2;
    const candidate = rows(middle);
    if (fits(candidate)) {
      low = middle;
      result = candidate;
    } else high = middle;
  }
  return result;
}
function appendRows(
  blocks: CoverTextBlock[],
  rows: TextRows,
  x: number,
  y: number,
  align: CanvasTextAlign
) {
  rows.lines.forEach((text, index) =>
    blocks.push({
      text,
      x,
      y: y + index * rows.size * lineSpacing,
      size: rows.size,
      align
    })
  );
}
/** Layout in image coordinates; fontSize is measured against a 1440px cover. */
export function coverTextBlocks(
  width: number,
  height: number,
  layout: CoverLayout,
  measure: MeasureText
): CoverTextBlock[] {
  const scale = height / 1440;
  const initialSize = Math.min(
    layout.fontSize * scale,
    width * 0.16,
    height * 0.14
  );
  const marginX = width * 0.08,
    marginY = height * 0.08,
    availableWidth = width - marginX * 2;
  const blocks: CoverTextBlock[] = [];
  const author = fitRows(
    layout.author,
    Math.min(initialSize * 0.3, 26 * scale),
    availableWidth,
    height * 0.12,
    1,
    measure
  );
  const authorY = height - marginY - author.height;
  const top = height * 0.1,
    bottom = author.lines.length ? authorY - height * 0.035 : height - marginY,
    availableHeight = bottom - top;
  const gap = Math.min(initialSize * 0.45, availableHeight * 0.05);
  if (layout.template.endsWith("-vertical")) {
    const subtitle = fitRows(
      layout.subtitle,
      Math.min(initialSize * 0.38, 32 * scale),
      availableWidth,
      availableHeight * 0.22,
      3,
      measure
    );
    const chars = Array.from(layout.title);
    const reserved =
      subtitle.height + (chars.length && subtitle.lines.length ? gap : 0);
    let size = Math.min(
      initialSize,
      (availableHeight - reserved) / (1 + Math.max(chars.length - 1, 0) * 1.12)
    );
    let columnWidth = Math.max(0, ...chars.map((text) => measure(text, size)));
    if (columnWidth > availableWidth) {
      size *= availableWidth / columnWidth;
      columnWidth = Math.max(0, ...chars.map((text) => measure(text, size)));
    }
    const x =
      layout.template === "left-vertical"
        ? marginX + columnWidth / 2
        : width - marginX - columnWidth / 2;
    chars.forEach((text, index) =>
      blocks.push({
        text,
        x,
        y: top + index * size * 1.12,
        size,
        align: "center"
      })
    );
    const titleHeight = chars.length
      ? size * (1 + (chars.length - 1) * 1.12)
      : 0;
    appendRows(
      blocks,
      subtitle,
      width / 2,
      top + titleHeight + (reserved - subtitle.height),
      "center"
    );
  } else {
    const subtitleAllowance = layout.subtitle ? availableHeight * 0.25 : 0;
    const title = fitRows(
      layout.title,
      initialSize,
      availableWidth,
      availableHeight -
        subtitleAllowance -
        (layout.title && layout.subtitle ? gap : 0),
      layout.template.startsWith("center-") ? 5 : 4,
      measure
    );
    const subtitle = fitRows(
      layout.subtitle,
      Math.min(title.size * 0.38, 32 * scale),
      availableWidth,
      subtitleAllowance,
      3,
      measure
    );
    const textGap = title.lines.length && subtitle.lines.length ? gap : 0;
    const groupHeight = title.height + textGap + subtitle.height;
    const y = layout.template.startsWith("bottom-")
      ? bottom - groupHeight
      : layout.template.startsWith("center-")
        ? (top + bottom - groupHeight) / 2
        : top;
    const align = layout.template.endsWith("-left")
      ? "left"
      : layout.template.endsWith("-right")
        ? "right"
        : "center";
    const x =
      align === "left"
        ? marginX
        : align === "right"
          ? width - marginX
          : width / 2;
    appendRows(blocks, title, x, y, align);
    appendRows(blocks, subtitle, x, y + title.height + textGap, align);
  }
  appendRows(blocks, author, width / 2, authorY, "center");
  return blocks;
}
export function loadCoverImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cover image unavailable"));
    image.src = url;
  });
}
export async function composeCover(
  image: HTMLImageElement,
  layout: CoverLayout
): Promise<string> {
  await document.fonts.load(
    `${layout.fontWeight} ${layout.fontSize}px "${layout.fontFamily}"`
  );
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(image, 0, 0);
  const font = (size: number) =>
    `${layout.fontWeight} ${size}px "${layout.fontFamily}"`;
  const blocks = coverTextBlocks(
    canvas.width,
    canvas.height,
    layout,
    (text, size) => {
      context.font = font(size);
      return context.measureText(text).width;
    }
  );
  context.textBaseline = "top";
  context.fillStyle = layout.color;
  for (const block of blocks) {
    context.font = font(block.size);
    context.textAlign = block.align;
    context.shadowColor = layout.shadow ? "rgba(0,0,0,.65)" : "transparent";
    context.shadowBlur = layout.shadow ? block.size * 0.12 : 0;
    context.shadowOffsetY = layout.shadow ? block.size * 0.04 : 0;
    if (layout.stroke) {
      context.lineWidth = Math.max(1, block.size * 0.035);
      context.strokeStyle = "#222222";
      context.strokeText(block.text, block.x, block.y);
    }
    context.fillText(block.text, block.x, block.y);
  }
  return canvas.toDataURL("image/png");
}
