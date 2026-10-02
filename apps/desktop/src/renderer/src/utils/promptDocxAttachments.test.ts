import { describe, expect, it } from "vitest";
import { PROMPT_TEXT_ATTACHMENT_DEFAULT_CONTENT_LENGTH } from "@deepwrite/contracts";
import { DOCX_MEDIA_TYPE } from "./docxDocumentText";
import { documentZipEntry } from "./documentZip.test-support";
import {
  PROMPT_ATTACHMENT_ACCEPT,
  readPromptAttachment
} from "./promptAttachments";

function documentXml(content: string): string {
  return `<w:document xmlns:w="urn:test"><w:body>${content}</w:body></w:document>`;
}

function docxFile(xml: string, name = "文稿.docx", type = ""): File {
  return new File(
    [documentZipEntry("word/document.xml", xml).buffer as ArrayBuffer],
    name,
    { type }
  );
}

describe("Word prompt attachments", () => {
  it("extracts paragraphs, tables, breaks and entities from a compressed DOCX", async () => {
    const xml = documentXml(
      "<w:p><w:r><w:t>雨夜 &amp; 归来</w:t><w:br/><w:t>第二行</w:t></w:r></w:p>" +
        "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>人物</w:t></w:r></w:p></w:tc>" +
        "<w:tc><w:p><w:r><w:t>林舟</w:t><w:tab/><w:t>侦探</w:t></w:r></w:p></w:tc></w:tr></w:tbl>"
    );
    const compressed = new Uint8Array(
      await new Response(
        new Blob([xml])
          .stream()
          .pipeThrough(new CompressionStream("deflate-raw"))
      ).arrayBuffer()
    );
    const file = new File(
      [
        documentZipEntry("word/document.xml", xml, compressed)
          .buffer as ArrayBuffer
      ],
      "文稿.docx",
      { type: DOCX_MEDIA_TYPE }
    );

    const { attachment } = await readPromptAttachment(file);
    expect(attachment).toMatchObject({
      kind: "text",
      name: "文稿.docx",
      mediaType: DOCX_MEDIA_TYPE,
      size: file.size
    });
    if (attachment.kind !== "text") throw new Error("Expected text attachment");
    expect(attachment.content).toContain("雨夜 & 归来\n第二行");
    expect(attachment.content).toContain("人物");
    expect(attachment.content).toContain("林舟\t侦探");
    expect(attachment.content).not.toContain("<w:");
  });

  it.each([
    ["文稿.DOCX", ""],
    ["文稿.docx", "application/octet-stream"],
    ["文稿", DOCX_MEDIA_TYPE]
  ])("recognizes Word file %s with MIME type %s", async (name, type) => {
    const result = await readPromptAttachment(
      docxFile(documentXml("<w:p><w:r><w:t>正文</w:t></w:r></w:p>"), name, type)
    );
    expect(result.attachment).toMatchObject({
      content: "正文",
      mediaType: DOCX_MEDIA_TYPE
    });
  });

  it("clips long Word text using the prompt attachment context limit", async () => {
    const text = "字".repeat(PROMPT_TEXT_ATTACHMENT_DEFAULT_CONTENT_LENGTH + 1);
    const { attachment, warning } = await readPromptAttachment(
      docxFile(documentXml(`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`))
    );
    expect(attachment).toMatchObject({
      content: text.slice(0, PROMPT_TEXT_ATTACHMENT_DEFAULT_CONTENT_LENGTH),
      truncated: true,
      originalLength: text.length
    });
    expect(warning).toContain("仅携带前");
  });

  it("rejects corrupt and empty Word documents with readable errors", async () => {
    await expect(
      readPromptAttachment(new File(["broken"], "损坏.docx"))
    ).rejects.toThrow("读取 Word“损坏.docx”失败");
    await expect(
      readPromptAttachment(docxFile(documentXml("<w:p/>")))
    ).rejects.toThrow("没有可读取的文本内容");
  });

  it("rejects an oversized Word file before reading its bytes", async () => {
    const file = docxFile("");
    Object.defineProperty(file, "size", { value: 25 * 1024 * 1024 + 1 });
    await expect(readPromptAttachment(file)).rejects.toThrow("超过 25 MB");
  });

  it("rejects encrypted entries and oversized decompressed XML", async () => {
    const bytes = documentZipEntry("word/document.xml", documentXml(""));
    const view = new DataView(bytes.buffer);
    const centralOffset = view.getUint32(bytes.length - 6, true);
    view.setUint16(centralOffset + 8, 1, true);
    await expect(
      readPromptAttachment(new File([bytes.buffer as ArrayBuffer], "加密.docx"))
    ).rejects.toThrow("受密码保护");
    view.setUint16(centralOffset + 8, 0, true);
    view.setUint32(centralOffset + 24, 32 * 1024 * 1024 + 1, true);
    await expect(
      readPromptAttachment(new File([bytes.buffer as ArrayBuffer], "过大.docx"))
    ).rejects.toThrow("正文 XML 过大");
  });

  it("includes the Word extension and MIME type in the native file picker", () => {
    expect(PROMPT_ATTACHMENT_ACCEPT.split(",")).toContain(".docx");
    expect(PROMPT_ATTACHMENT_ACCEPT.split(",")).toContain(DOCX_MEDIA_TYPE);
  });
});
