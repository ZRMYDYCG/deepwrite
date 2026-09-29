import {
  VOICE_MAX_BASE64_LENGTH,
  VOICE_MAX_DURATION_MS
} from "@deepwrite/contracts";

/** Validate the actual recording bytes before they leave Main. */
export function inspectVoiceAudio(audioBase64: string): {
  durationMs: number;
} {
  if (
    !audioBase64 ||
    audioBase64.length > VOICE_MAX_BASE64_LENGTH ||
    audioBase64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)
  ) {
    throw new Error("录音数据无效或超过大小限制，请重新录音。");
  }
  const audio = Buffer.from(audioBase64, "base64");
  if (
    audio.toString("base64") !== audioBase64 ||
    audio.length < 44 ||
    audio.toString("ascii", 0, 4) !== "RIFF" ||
    audio.toString("ascii", 8, 12) !== "WAVE" ||
    audio.readUInt32LE(4) + 8 !== audio.length
  ) {
    throw new Error("录音格式无效，请重新录音。");
  }
  let formatFound = false;
  let dataSize: number | undefined;
  let offset = 12;
  while (offset + 8 <= audio.length) {
    const kind = audio.toString("ascii", offset, offset + 4);
    const size = audio.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > audio.length) throw new Error("录音文件不完整，请重新录音。");
    if (kind === "fmt ") {
      if (
        formatFound ||
        size < 16 ||
        audio.readUInt16LE(start) !== 1 ||
        audio.readUInt16LE(start + 2) !== 1 ||
        audio.readUInt32LE(start + 4) !== 16_000 ||
        audio.readUInt32LE(start + 8) !== 32_000 ||
        audio.readUInt16LE(start + 12) !== 2 ||
        audio.readUInt16LE(start + 14) !== 16
      ) {
        throw new Error("录音必须使用 16 kHz 单声道 PCM16 WAV 格式。");
      }
      formatFound = true;
    } else if (kind === "data") {
      if (dataSize !== undefined || size === 0 || size % 2 !== 0) {
        throw new Error("录音数据无效，请重新录音。");
      }
      dataSize = size;
    }
    offset = end + (size % 2);
  }
  if (!formatFound || dataSize === undefined || offset !== audio.length) {
    throw new Error("录音文件不完整，请重新录音。");
  }
  const durationMs = Math.ceil((dataSize / 32_000) * 1_000);
  if (durationMs > VOICE_MAX_DURATION_MS) {
    throw new Error("单次录音不能超过 10 分钟。");
  }
  return { durationMs };
}
