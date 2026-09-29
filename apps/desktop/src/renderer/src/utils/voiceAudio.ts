import { t } from "../i18n";
import { VOICE_MAX_DURATION_MS } from "@deepwrite/contracts/renderer";

export const VOICE_SAMPLE_RATE = 16_000;

export interface RecordedVoice {
  audioBase64: string;
  durationMs: number;
}

/** Produces the same PCM16 mono WAV payload for every speech provider. */
export function encodeVoiceWav(
  chunks: readonly Float32Array[],
  sourceRate: number
): RecordedVoice {
  const count = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const source = new Float32Array(count);
  let offset = 0;
  for (const chunk of chunks) {
    source.set(chunk, offset);
    offset += chunk.length;
  }
  const length = Math.min(
    Math.floor((count * VOICE_SAMPLE_RATE) / sourceRate),
    (VOICE_MAX_DURATION_MS * VOICE_SAMPLE_RATE) / 1_000
  );
  if (!length)
    throw new Error(
      t("workspace.voiceAudio.noAudioWasRecordedCheckYourMicrophoneAndTry")
    );
  const bytes = new Uint8Array(44 + length * 2);
  const view = new DataView(bytes.buffer);
  const writeLabel = (at: number, label: string): void => {
    for (let index = 0; index < label.length; index++)
      bytes[at + index] = label.charCodeAt(index);
  };
  writeLabel(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  writeLabel(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, VOICE_SAMPLE_RATE, true);
  view.setUint32(28, VOICE_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeLabel(36, "data");
  view.setUint32(40, length * 2, true);
  const ratio = sourceRate / VOICE_SAMPLE_RATE;
  for (let index = 0; index < length; index++) {
    const start = Math.floor(index * ratio);
    const end = Math.min(
      count,
      Math.max(start + 1, Math.floor((index + 1) * ratio))
    );
    let sum = 0;
    for (let at = start; at < end; at++) sum += source[at] ?? 0;
    const value = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(44 + index * 2, value * (value < 0 ? 0x8000 : 0x7fff), true);
  }
  const parts: string[] = [];
  for (let index = 0; index < bytes.length; index += 0x8000)
    parts.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
  return {
    audioBase64: btoa(parts.join("")),
    durationMs: Math.round((length / VOICE_SAMPLE_RATE) * 1_000)
  };
}
