function normalizeText(text: string): string {
  return text
    .replace(/\uFEFF/gu, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+\n/gu, "\n")
    .trim();
}

function decodeUtf16BigEndian(bytes: Uint8Array): string {
  const swapped = new Uint8Array(Math.max(0, bytes.length - 2));
  for (let index = 2; index + 1 < bytes.length; index += 2) {
    swapped[index - 2] = bytes[index + 1]!;
    swapped[index - 1] = bytes[index]!;
  }
  return new TextDecoder("utf-16le").decode(swapped);
}

export function decodeAnalysisText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return normalizeText(new TextDecoder("utf-16le").decode(bytes.subarray(2)));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return normalizeText(decodeUtf16BigEndian(bytes));
  }
  const utf8 =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? bytes.subarray(3)
      : bytes;
  try {
    return normalizeText(
      new TextDecoder("utf-8", { fatal: true }).decode(utf8)
    );
  } catch {
    return normalizeText(new TextDecoder("gb18030").decode(bytes));
  }
}
