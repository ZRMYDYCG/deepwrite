import { VoiceTranscribeInputSchema } from "@deepwrite/contracts";
import { encodeVoiceWav } from "../../renderer/src/utils/voiceAudio";
import { describe, expect, it } from "vitest";
import { inspectVoiceAudio } from "./voice-audio";
import { voiceWav } from "./voice-test-support";

describe("inspectVoiceAudio", () => {
  it("uses PCM bytes to calculate actual duration", () => {
    expect(inspectVoiceAudio(voiceWav(1_234).toString("base64"))).toEqual({
      durationMs: 1_234
    });
    expect(inspectVoiceAudio(voiceWav(600_000).toString("base64"))).toEqual({
      durationMs: 600_000
    });
  });

  it("accepts ten-minute renderer audio through the IPC contract and Main validation", () => {
    const audio = encodeVoiceWav([new Float32Array(16_000 * 600)], 16_000);
    expect(
      VoiceTranscribeInputSchema.safeParse({
        ...audio,
        requestId: "ten-minute-test",
        profileId: "mimo-api"
      }).success
    ).toBe(true);
    expect(inspectVoiceAudio(audio.audioBase64)).toEqual({
      durationMs: 600_000
    });
  });

  it("rejects overlong recordings and noncanonical base64", () => {
    expect(() =>
      inspectVoiceAudio(voiceWav(600_001).toString("base64"))
    ).toThrow("10 分钟");
    expect(() =>
      inspectVoiceAudio(`${voiceWav().toString("base64")}\n`)
    ).toThrow();
    expect(() => inspectVoiceAudio("AA=A")).toThrow();
  });

  it("rejects corrupted header size, sample format and data chunks", () => {
    const invalid = [
      (audio: Buffer) => audio.writeUInt32LE(0, 4),
      (audio: Buffer) => audio.writeUInt16LE(2, 22),
      (audio: Buffer) => audio.writeUInt16LE(32, 34),
      (audio: Buffer) => audio.writeUInt32LE(100_000, 40),
      (audio: Buffer) => audio.writeUInt32LE(3, 40),
      (audio: Buffer) => audio.write("none", 36)
    ];
    for (const mutate of invalid) {
      const audio = voiceWav();
      mutate(audio);
      expect(() => inspectVoiceAudio(audio.toString("base64"))).toThrow();
    }
    expect(() => inspectVoiceAudio(voiceWav(0).toString("base64"))).toThrow();
  });
});
