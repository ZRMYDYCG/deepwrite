import { describe, expect, it } from "vitest";
import {
  CommandEnvelopeSchema,
  VoiceSettingsInputSchema,
  VoiceSettingsSchema,
  VoiceTranscribeInputSchema,
  createDefaultVoiceSettings,
  createEnvelope
} from "./index";

function input() {
  const settings = createDefaultVoiceSettings();
  return {
    ...settings,
    profiles: settings.profiles.map(({ id, model }) => ({
      id,
      model,
      baseUrl: "https://voice.example.test/v1"
    }))
  };
}

describe("voice contracts", () => {
  it("keeps four independent profiles and rejects ambiguous configuration", () => {
    expect(VoiceSettingsInputSchema.parse(input()).profiles).toHaveLength(4);
    const duplicate = input();
    duplicate.profiles[1]!.id = duplicate.profiles[0]!.id;
    expect(VoiceSettingsInputSchema.safeParse(duplicate).success).toBe(false);
    const insecure = input();
    insecure.profiles[0]!.baseUrl = "http://voice.example.test/v1";
    expect(VoiceSettingsInputSchema.safeParse(insecure).success).toBe(false);
    insecure.profiles[0]!.baseUrl =
      "https://voice.example.test/?key=invalid-placeholder";
    expect(VoiceSettingsInputSchema.safeParse(insecure).success).toBe(false);
    insecure.profiles[0]!.baseUrl = "invalid-url";
    expect(VoiceSettingsInputSchema.safeParse(insecure).success).toBe(false);
  });

  it("never accepts credentials as public settings", () => {
    const settings = createDefaultVoiceSettings();
    const profiles = settings.profiles.map((profile) => ({
      ...profile,
      baseUrl: "https://voice.example.test/v1",
      apiKey: "invalid-placeholder"
    }));
    expect(
      VoiceSettingsSchema.safeParse({ ...settings, profiles }).success
    ).toBe(false);
  });

  it("routes voice commands through envelopes and rejects oversized or injected input", () => {
    expect(
      CommandEnvelopeSchema.parse(
        createEnvelope("voice.saveSettings", input(), { id: "voice_test" })
      ).type
    ).toBe("voice.saveSettings");
    const recording = {
      requestId: "voice_test",
      profileId: "mimo-api",
      audioBase64: "A".repeat(64),
      durationMs: 1000
    };
    expect(VoiceTranscribeInputSchema.safeParse(recording).success).toBe(true);
    expect(
      VoiceTranscribeInputSchema.safeParse({
        ...recording,
        apiKey: "invalid-placeholder"
      }).success
    ).toBe(false);
    expect(
      VoiceTranscribeInputSchema.safeParse({
        ...recording,
        durationMs: 600_001
      }).success
    ).toBe(false);
    expect(
      VoiceTranscribeInputSchema.safeParse({
        ...recording,
        audioBase64: "A".repeat(26_000_001)
      }).success
    ).toBe(false);
  });
});
