import { formatError } from "../i18n/errors";
import { createScopedTranslator, locale } from "../i18n";
import {
  PROMPT_IMAGE_ATTACHMENT_MAX_BYTES,
  PROMPT_TEXT_ATTACHMENT_DEFAULT_CONTENT_LENGTH,
  PROMPT_TEXT_ATTACHMENT_MAX_CONTENT_LENGTH,
  PromptImageAttachmentSchema,
  PromptTextAttachmentSchema,
  type PromptImageMediaType,
  type UserPromptAttachment
} from "@deepwrite/contracts/renderer";
import { createId } from "@deepwrite/shared";
import { DOCX_MEDIA_TYPE, extractDocxText } from "./docxDocumentText";

const t = createScopedTranslator("workspace.promptAttachments");

export const PROMPT_ATTACHMENT_ACCEPT = [
  ".txt",
  ".md",
  ".markdown",
  ".pdf",
  ".docx",
  DOCX_MEDIA_TYPE,
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
].join(",");

const TEXT_FILE_MAX_BYTES = 5 * 1024 * 1024;
const PDF_FILE_MAX_BYTES = 20 * 1024 * 1024;
const DOCX_FILE_MAX_BYTES = 25 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown"]);
const IMAGE_MEDIA_TYPES = new Set<PromptImageMediaType>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
]);

export interface PromptAttachmentReadResult {
  attachment: UserPromptAttachment;
  warning?: string;
}

export function promptAttachmentFilesFromClipboard(
  clipboardData: Pick<DataTransfer, "files" | "items"> | null
): File[] {
  if (!clipboardData) return [];

  const itemFiles = Array.from(clipboardData.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);

  return itemFiles.length > 0 ? itemFiles : Array.from(clipboardData.files);
}

function extensionOf(name: string): string {
  return name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
}

function attachmentId(): string {
  return createId("prompt_attachment");
}

function imageMediaType(file: File): PromptImageMediaType | undefined {
  if (IMAGE_MEDIA_TYPES.has(file.type as PromptImageMediaType)) {
    return file.type as PromptImageMediaType;
  }
  const extension = extensionOf(file.name);
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return undefined;
}

function textMediaType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") {
    return file.type;
  }
  return extensionOf(file.name) === "txt" ? "text/plain" : "text/markdown";
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8_192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8_192)));
  }
  return globalThis.btoa(chunks.join(""));
}

async function readImage(
  file: File,
  mediaType: PromptImageMediaType
): Promise<PromptAttachmentReadResult> {
  if (file.size > PROMPT_IMAGE_ATTACHMENT_MAX_BYTES) {
    throw new Error(
      t("imageExceedsMbAndCannotBeSentToThe", {
        name: file.name
      })
    );
  }
  const data = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  return {
    attachment: PromptImageAttachmentSchema.parse({
      id: attachmentId(),
      kind: "image",
      name: file.name,
      mediaType,
      size: file.size,
      data
    })
  };
}

function extractedTextAttachment(
  file: File,
  mediaType: string,
  extractedContent: string,
  maxCharacters: number
): PromptAttachmentReadResult {
  const normalized = extractedContent.replace(/^\uFEFF/, "").trim();
  if (!normalized) {
    throw new Error(
      mediaType === "application/pdf"
        ? t("pdfHasNoExtractableTextRunOcrOnScanned", { name: file.name })
        : t("fileContainsNoReadableText", {
            name: file.name
          })
    );
  }
  const content = normalized.slice(0, maxCharacters);
  const truncated = content.length < normalized.length;
  return {
    attachment: PromptTextAttachmentSchema.parse({
      id: attachmentId(),
      kind: "text",
      name: file.name,
      mediaType,
      size: file.size,
      content,
      ...(truncated
        ? { truncated: true, originalLength: normalized.length }
        : {})
    }),
    ...(truncated
      ? {
          warning: t("isTooLongOnlyTheFirstCharactersAreAttached", {
            name: file.name,
            toLocaleString: maxCharacters.toLocaleString(locale.value)
          })
        }
      : {})
  };
}

async function readPlainText(
  file: File,
  maxCharacters: number
): Promise<PromptAttachmentReadResult> {
  if (file.size > TEXT_FILE_MAX_BYTES) {
    throw new Error(
      t("textFileExceedsMbReduceItsSizeBeforeUploading", { name: file.name })
    );
  }
  return extractedTextAttachment(
    file,
    textMediaType(file),
    await file.text(),
    maxCharacters
  );
}

async function readPdfText(
  file: File,
  maxCharacters: number
): Promise<PromptAttachmentReadResult> {
  if (file.size > PDF_FILE_MAX_BYTES) {
    throw new Error(
      t("pdfExceedsMbSplitOrCompressItBeforeUploading", { name: file.name })
    );
  }
  const [{ getDocument, GlobalWorkerOptions }, workerModule] =
    await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url")
    ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;
  const loadingTask = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useSystemFonts: true
  });
  try {
    const document = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      let pageText = "";
      for (const item of textContent.items) {
        if (!("str" in item)) continue;
        pageText += item.str;
        pageText += item.hasEOL ? "\n" : " ";
      }
      if (pageText.trim()) {
        pages.push(pageText.trim());
      }
      page.cleanup();
    }
    return extractedTextAttachment(
      file,
      "application/pdf",
      pages.join("\n\n"),
      maxCharacters
    );
  } catch (error: unknown) {
    const message = formatError(error, t("unknownPdfParsingError"));
    if (/password/i.test(message)) {
      throw new Error(
        t("pdfIsPasswordProtectedAndCannotBeRead", {
          name: file.name
        })
      );
    }
    throw new Error(
      t("failedToReadPdf", {
        name: file.name,
        message: message
      })
    );
  } finally {
    await loadingTask.destroy();
  }
}

async function readDocxText(
  file: File,
  maxCharacters: number
): Promise<PromptAttachmentReadResult> {
  if (file.size > DOCX_FILE_MAX_BYTES) {
    throw new Error(
      t("wordDocumentExceedsMbSplitOrCompressItBefore", { name: file.name })
    );
  }
  try {
    return extractedTextAttachment(
      file,
      DOCX_MEDIA_TYPE,
      await extractDocxText(await file.arrayBuffer()),
      maxCharacters
    );
  } catch (error: unknown) {
    const message = formatError(error, t("unknownWordParsingError"));
    throw new Error(
      t("failedToReadWordDocument", {
        name: file.name,
        message: message
      })
    );
  }
}

export async function readPromptAttachment(
  file: File,
  maxCharacters = PROMPT_TEXT_ATTACHMENT_DEFAULT_CONTENT_LENGTH
): Promise<PromptAttachmentReadResult> {
  if (
    !Number.isInteger(maxCharacters) ||
    maxCharacters < 1_000 ||
    maxCharacters > PROMPT_TEXT_ATTACHMENT_MAX_CONTENT_LENGTH
  ) {
    throw new Error("Invalid text attachment character limit.");
  }
  const mediaType = imageMediaType(file);
  if (mediaType) {
    return readImage(file, mediaType);
  }
  const extension = extensionOf(file.name);
  if (extension === "pdf" || file.type === "application/pdf") {
    return readPdfText(file, maxCharacters);
  }
  if (extension === "docx" || file.type === DOCX_MEDIA_TYPE) {
    return readDocxText(file, maxCharacters);
  }
  if (TEXT_EXTENSIONS.has(extension) || file.type.startsWith("text/")) {
    return readPlainText(file, maxCharacters);
  }
  throw new Error(
    t("theFileTypeOfIsNotSupportedChooseTxt", {
      name: file.name
    })
  );
}
