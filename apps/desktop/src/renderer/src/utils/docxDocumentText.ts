import { createScopedTranslator } from "../i18n";

const t = createScopedTranslator("workspace.docxDocumentText");
export const DOCX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const WORD_DOCUMENT_XML_MAX_BYTES = 32 * 1024 * 1024;
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;

interface ZipEntry {
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  encrypted: boolean;
}

function findZipEntry(
  bytes: Uint8Array,
  expectedName: string
): ZipEntry | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimumOffset = Math.max(0, bytes.length - 65_557);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) return undefined;

  const entryCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > bytes.length ||
      view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY_HEADER
    ) {
      throw new Error(t("theWordDocumentZipDirectoryIsCorrupt"));
    }
    const flags = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.length)
      throw new Error(t("aZipFilenameInTheWordDocumentIsCorrupt"));
    const name = decoder.decode(bytes.subarray(nameStart, nameEnd));
    if (name === expectedName) {
      return {
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
        encrypted: Boolean(flags & 0x1)
      };
    }
    offset = nameEnd + extraLength + commentLength;
  }
  return undefined;
}

async function inflateRawWithLimit(
  compressed: Uint8Array,
  maximumBytes: number
): Promise<Uint8Array> {
  const payload = compressed.buffer.slice(
    compressed.byteOffset,
    compressed.byteOffset + compressed.byteLength
  ) as ArrayBuffer;
  const stream = new Blob([payload])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error(t("theWordDocumentXmlIsTooLargeToRead"));
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function readZipEntry(
  bytes: Uint8Array,
  entry: ZipEntry
): Promise<Uint8Array> {
  if (entry.encrypted)
    throw new Error(t("passwordProtectedWordDocumentsAreNotSupported"));
  if (entry.uncompressedSize > WORD_DOCUMENT_XML_MAX_BYTES) {
    throw new Error(t("theWordDocumentXmlIsTooLargeToRead"));
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (
    offset + 30 > bytes.length ||
    view.getUint32(offset, true) !== ZIP_LOCAL_FILE_HEADER
  ) {
    throw new Error(t("theWordDocumentZipContentsAreCorrupt"));
  }
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.length)
    throw new Error(t("theWordDocumentZipDataIsIncomplete"));
  const compressed = bytes.subarray(dataStart, dataEnd);
  if (entry.compressionMethod === 0) {
    if (compressed.byteLength > WORD_DOCUMENT_XML_MAX_BYTES) {
      throw new Error(t("theWordDocumentXmlIsTooLargeToRead"));
    }
    return compressed.slice();
  }
  if (entry.compressionMethod === 8) {
    return inflateRawWithLimit(compressed, WORD_DOCUMENT_XML_MAX_BYTES);
  }
  throw new Error(
    t("zipCompressionMethodInThisWordDocumentIsNot", {
      compressionMethod: entry.compressionMethod
    })
  );
}

function decodeXmlEntities(text: string): string {
  return text.replace(
    /&(?:#(x[\da-f]+|\d+)|amp|lt|gt|quot|apos);/giu,
    (entity, numeric: string | undefined) => {
      if (numeric) {
        const hexadecimal = numeric[0]?.toLowerCase() === "x";
        const codePoint = Number.parseInt(
          hexadecimal ? numeric.slice(1) : numeric,
          hexadecimal ? 16 : 10
        );
        if (
          Number.isInteger(codePoint) &&
          codePoint >= 0 &&
          codePoint <= 0x10ffff
        ) {
          return String.fromCodePoint(codePoint);
        }
        return "";
      }
      return (
        (
          {
            "&amp;": "&",
            "&lt;": "<",
            "&gt;": ">",
            "&quot;": '"',
            "&apos;": "'"
          } as Record<string, string>
        )[entity.toLowerCase()] ?? entity
      );
    }
  );
}

function extractDocxXmlText(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<(?:\w+:)?tab\b[^>]*\/?\s*>/giu, "\t")
      .replace(/<(?:\w+:)?(?:br|cr)\b[^>]*\/?\s*>/giu, "\n")
      .replace(/<\/(?:\w+:)?tc\s*>/giu, "\t")
      .replace(/<\/(?:\w+:)?(?:p|tr)\s*>/giu, "\n")
      .replace(/<[^>]+>/gu, "")
  );
}

export async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const entry = findZipEntry(bytes, "word/document.xml");
  if (!entry) throw new Error(t("theWordDocumentIsMissingWordDocumentXml"));
  const xmlBytes = await readZipEntry(bytes, entry);
  return extractDocxXmlText(new TextDecoder().decode(xmlBytes));
}
