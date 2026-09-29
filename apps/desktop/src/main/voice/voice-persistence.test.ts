import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VoiceSettingsInput } from "@deepwrite/contracts";
import { VoicePersistence } from "./voice-persistence";
import {
  INVALID_VOICE_KEY,
  testSecureStorage,
  voiceSettingsInput
} from "./voice-test-support";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "deepwrite-voice-storage-"));
  roots.push(root);
  return { root, persistence: new VoicePersistence(root, testSecureStorage) };
}

describe("VoicePersistence", () => {
  it("starts with four independent profiles and no usage", async () => {
    const { persistence } = await setup();
    const settings = await persistence.getSettings();
    expect(settings.activeProfileId).toBe("mimo-token-plan");
    expect(settings.profiles.map((profile) => profile.id)).toEqual([
      "mimo-token-plan",
      "mimo-api",
      "aliyun-token-plan",
      "aliyun-api"
    ]);
    expect(settings.profiles.every((profile) => !profile.hasApiKey)).toBe(true);
    await expect(persistence.getUsage()).resolves.toEqual([]);
  });

  it("persists encrypted keys atomically and never returns them to settings readers", async () => {
    const { persistence, root } = await setup();
    const settings = voiceSettingsInput();
    settings.profiles[1]!.apiKey = "invalid-other-test-key";
    const publicSettings = await persistence.saveSettings(settings);
    expect(publicSettings.profiles.every((profile) => profile.hasApiKey)).toBe(
      true
    );
    expect(JSON.stringify(publicSettings)).not.toContain(INVALID_VOICE_KEY);
    const contents = await readFile(join(root, "config", "voice.json"), "utf8");
    expect(contents).not.toContain(INVALID_VOICE_KEY);
    expect(contents).not.toContain("invalid-other-test-key");
    expect(contents).not.toContain('"apiKey"');
    const reloaded = new VoicePersistence(root, testSecureStorage);
    expect(await reloaded.getSettings()).toEqual(publicSettings);
    expect((await reloaded.resolve("mimo-api")).apiKey).toBe(
      "invalid-other-test-key"
    );
    expect((await reloaded.resolve("mimo-token-plan")).apiKey).toBe(
      INVALID_VOICE_KEY
    );
  });

  it("retains blank keys when switching profiles and supports explicit removal", async () => {
    const { persistence } = await setup();
    const settings = voiceSettingsInput();
    await persistence.saveSettings(settings);
    settings.activeProfileId = "aliyun-token-plan";
    settings.language = "en";
    settings.microphoneId = "test-microphone";
    for (const profile of settings.profiles) profile.apiKey = "   ";
    await persistence.saveSettings(settings);
    expect(await persistence.resolve("aliyun-token-plan")).toMatchObject({
      apiKey: INVALID_VOICE_KEY,
      language: "en"
    });
    settings.profiles[2]!.clearApiKey = true;
    const saved = await persistence.saveSettings(settings);
    expect(saved.profiles[2]!.hasApiKey).toBe(false);
    expect(saved.profiles[0]!.hasApiKey).toBe(true);
    await expect(persistence.resolve("aliyun-token-plan")).rejects.toThrow(
      "API Key"
    );
  });

  it("fails closed without encryption and preserves the previous configuration", async () => {
    const { persistence, root } = await setup();
    await persistence.saveSettings(voiceSettingsInput());
    const unavailable = new VoicePersistence(root, {
      ...testSecureStorage,
      isEncryptionAvailable: () => false
    });
    const attempted = voiceSettingsInput();
    attempted.activeProfileId = "aliyun-api";
    await expect(unavailable.saveSettings(attempted)).rejects.toThrow(
      "安全存储不可用"
    );
    expect((await persistence.getSettings()).activeProfileId).toBe(
      "mimo-token-plan"
    );
    await expect(unavailable.resolve("mimo-api")).rejects.toThrow(
      "安全存储不可用"
    );
    const noNewSecrets: VoiceSettingsInput = {
      ...attempted,
      profiles: attempted.profiles.map(
        ({ apiKey: _apiKey, ...profile }) => profile
      )
    };
    await expect(unavailable.saveSettings(noNewSecrets)).resolves.toMatchObject(
      { activeProfileId: "aliyun-api" }
    );
  });

  it("sanitizes crypto failures and does not poison future saves", async () => {
    const { root } = await setup();
    const encryptString = vi
      .fn(testSecureStorage.encryptString)
      .mockImplementationOnce(() => {
        throw new Error(INVALID_VOICE_KEY);
      });
    const persistence = new VoicePersistence(root, {
      ...testSecureStorage,
      encryptString
    });
    await expect(
      persistence.saveSettings(voiceSettingsInput())
    ).rejects.toThrow("加密失败");
    await expect(
      persistence.saveSettings(voiceSettingsInput())
    ).resolves.toHaveProperty("profiles");
    const brokenDecrypt = new VoicePersistence(root, {
      ...testSecureStorage,
      decryptString: () => {
        throw new Error(INVALID_VOICE_KEY);
      }
    });
    await expect(brokenDecrypt.resolve("mimo-api")).rejects.not.toThrow(
      INVALID_VOICE_KEY
    );
  });

  it("rejects malformed settings without echoing their contents", async () => {
    const { persistence, root } = await setup();
    await persistence.saveSettings(voiceSettingsInput());
    await writeFile(
      join(root, "config", "voice.json"),
      `{${INVALID_VOICE_KEY}`,
      "utf8"
    );
    await expect(persistence.getSettings()).rejects.not.toThrow(
      INVALID_VOICE_KEY
    );
    await expect(
      persistence.saveSettings(voiceSettingsInput())
    ).rejects.toThrow("无法读取");
  });

  it("rejects URLs with insecure transport, credentials or query parameters", async () => {
    const { persistence } = await setup();
    for (const baseUrl of [
      "http://voice.example.test",
      "https://user:invalid@voice.example.test",
      "https://voice.example.test?key=invalid"
    ]) {
      const settings = voiceSettingsInput();
      settings.profiles[0]!.baseUrl = baseUrl;
      await expect(persistence.saveSettings(settings)).rejects.toThrow(
        "语音配置无效"
      );
    }
  });

  it("retains only the ten newest records on disk, including existing history", async () => {
    const { persistence, root } = await setup();
    await persistence.saveSettings(voiceSettingsInput());
    const records = Array.from({ length: 12 }, (_, index) => ({
      requestId: `voice-${index}`,
      profileId: "mimo-api" as const,
      model: "test-asr",
      createdAt: new Date(Date.UTC(2026, 8, 28, 0, index)).toISOString(),
      durationMs: 1_000
    }));
    const path = join(root, "config", "voice-usage.json");
    await writeFile(path, JSON.stringify([...records].reverse()));
    expect(await persistence.getUsage()).toEqual(records.slice(2));
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(records.slice(2));
    const newest = {
      ...records[11]!,
      requestId: "voice-new",
      createdAt: "2026-09-28T01:00:00.000Z"
    };
    await Promise.all([
      persistence.appendUsage(newest),
      persistence.appendUsage(records[0]!)
    ]);
    const expected = [...records.slice(3), newest];
    expect(
      await new VoicePersistence(root, testSecureStorage).getUsage()
    ).toEqual(expected);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(expected);
  });

  it("serializes concurrent usage records and reloads them independently", async () => {
    const { persistence, root } = await setup();
    const usage = {
      requestId: "voice-a",
      profileId: "mimo-api" as const,
      model: "test-asr",
      createdAt: "2026-09-28T00:00:00.000Z",
      durationMs: 1_000
    };
    await Promise.all([
      persistence.appendUsage(usage),
      persistence.appendUsage({ ...usage, requestId: "voice-b" }),
      persistence.saveSettings(voiceSettingsInput()),
      persistence.appendUsage(usage)
    ]);
    const reloaded = new VoicePersistence(root, testSecureStorage);
    expect((await reloaded.getUsage()).map((entry) => entry.requestId)).toEqual(
      ["voice-a", "voice-b"]
    );
    const contents = await readFile(
      join(root, "config", "voice-usage.json"),
      "utf8"
    );
    expect(contents).not.toContain(INVALID_VOICE_KEY);
    expect(contents).not.toContain("audioBase64");
    expect(contents).not.toContain("text");
  });
});
