import {
  createDefaultVoiceSettings,
  type VoiceSettingsInput
} from "@deepwrite/contracts";
import type { VoiceSecureStorage } from "./voice-persistence";

export const INVALID_VOICE_KEY = "invalid-test-voice-key";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

export const testSecureStorage: VoiceSecureStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) =>
    Buffer.from(Buffer.from(value).map((byte) => byte ^ 0x5a)),
  decryptString: (value) =>
    Buffer.from(value.map((byte) => byte ^ 0x5a)).toString("utf8")
};

export function voiceSettingsInput(): VoiceSettingsInput {
  const settings = createDefaultVoiceSettings();
  return {
    ...settings,
    profiles: settings.profiles.map((profile) => ({
      id: profile.id,
      model: profile.model,
      baseUrl: profile.id.startsWith("mimo-")
        ? "https://voice.example.test/v1"
        : "https://voice.example.test",
      apiKey: INVALID_VOICE_KEY
    }))
  };
}

export function voiceWav(durationMs = 1_000): Buffer {
  const size = durationMs * 32;
  const audio = Buffer.alloc(44 + size);
  audio.write("RIFF", 0);
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.write("WAVE", 8);
  audio.write("fmt ", 12);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(16_000, 24);
  audio.writeUInt32LE(32_000, 28);
  audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34);
  audio.write("data", 36);
  audio.writeUInt32LE(size, 40);
  return audio;
}
