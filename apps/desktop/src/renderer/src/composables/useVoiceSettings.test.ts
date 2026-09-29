import { describe, expect, it, vi } from "vitest";
import type {
  VoiceApi,
  VoiceSettings,
  VoiceSettingsInput
} from "@deepwrite/contracts";
import { createDefaultVoiceSettings } from "@deepwrite/contracts/renderer";
import { useVoiceSettings } from "./useVoiceSettings";

function fixture(): VoiceSettings {
  const settings = createDefaultVoiceSettings();
  settings.profiles = settings.profiles.map((profile) => ({
    ...profile,
    baseUrl: `https://${profile.id}.example.test/v1`,
    model: "test-asr"
  }));
  return settings;
}

function setup() {
  const stored = fixture();
  const api = {
    getSettings: vi.fn(async () => structuredClone(stored)),
    saveSettings: vi.fn(
      async (input: VoiceSettingsInput): Promise<VoiceSettings> => ({
        ...input,
        profiles: input.profiles.map(({ apiKey, clearApiKey, ...profile }) => ({
          ...profile,
          hasApiKey: clearApiKey
            ? false
            : Boolean(
                apiKey ||
                stored.profiles.find((candidate) => candidate.id === profile.id)
                  ?.hasApiKey
              )
        }))
      })
    ),
    getUsage: vi.fn(async () => [])
  };
  const notifications = { warning: vi.fn(), error: vi.fn(), success: vi.fn() };
  const form = useVoiceSettings({
    api: () => api as unknown as VoiceApi,
    notifications
  });
  return { form, api, stored, notifications };
}

describe("voice settings", () => {
  it("keeps all four profile credentials and endpoints independent and clears key drafts after saving", async () => {
    const { form, api } = setup();
    await form.load();
    form.apiKey.value = "mimo_plan_test_only_invalid";
    form.currentProfile.value.model = "plan-asr";
    form.accessMode.value = "api";
    form.apiKey.value = "mimo_api_test_only_invalid";
    form.provider.value = "aliyun";
    form.apiKey.value = "aliyun_api_test_only_invalid";
    form.accessMode.value = "token-plan";
    form.apiKey.value = "aliyun_plan_test_only_invalid";
    expect(await form.save()).toBe(true);
    const input = api.saveSettings.mock.calls[0]![0];
    expect(input.activeProfileId).toBe("aliyun-token-plan");
    expect(input.profiles.map(({ apiKey }) => apiKey)).toEqual([
      "mimo_plan_test_only_invalid",
      "mimo_api_test_only_invalid",
      "aliyun_plan_test_only_invalid",
      "aliyun_api_test_only_invalid"
    ]);
    expect(input.profiles[0]!.model).toBe("plan-asr");
    expect(input.profiles.every((profile) => !("hasApiKey" in profile))).toBe(
      true
    );
    for (const profile of form.settings.value.profiles) {
      form.settings.value.activeProfileId = profile.id;
      expect(form.apiKey.value).toBe("");
      expect(form.keyConfigured.value).toBe(true);
    }
  });

  it("preserves an existing secret for a blank field and sends an explicit removal only when chosen", async () => {
    const { form, api, stored } = setup();
    stored.profiles[0]!.hasApiKey = true;
    await form.load();
    form.apiKey.value = "   ";
    await form.save();
    expect(api.saveSettings.mock.calls[0]![0].profiles[0]).not.toHaveProperty(
      "apiKey"
    );
    expect(form.keyConfigured.value).toBe(true);
    form.removeCurrentKey();
    expect(form.keyConfigured.value).toBe(false);
    await form.save();
    expect(api.saveSettings.mock.calls[1]![0].profiles[0]).toMatchObject({
      clearApiKey: true
    });
    expect(form.keyConfigured.value).toBe(false);
  });

  it("rejects credential-bearing endpoints before saving and reports failures through notifications", async () => {
    const { form, api, notifications } = setup();
    await form.load();
    form.currentProfile.value.baseUrl =
      "https://example.test/v1?key=invalid_test_key";
    expect(await form.save()).toBe(false);
    expect(api.saveSettings).not.toHaveBeenCalled();
    expect(notifications.warning).toHaveBeenCalled();
    form.currentProfile.value.baseUrl = "https://example.test/v1";
    form.apiKey.value = "test_only_invalid";
    api.saveSettings.mockRejectedValueOnce(new Error("无法保存语音配置"));
    expect(await form.save()).toBe(false);
    expect(form.apiKey.value).toBe("");
    expect(form.saving.value).toBe(false);
    expect(notifications.error).toHaveBeenCalledWith("无法保存语音配置");
  });

  it("cancels profile edits without saving or retaining credential changes", async () => {
    const { form, api, stored } = setup();
    stored.profiles[0]!.hasApiKey = true;
    await form.load();
    form.beginEdit();
    form.removeCurrentKey();
    form.currentProfile.value.model = "changed-model";
    form.provider.value = "aliyun";
    form.apiKey.value = "test_only_invalid";
    form.currentProfile.value.baseUrl = "https://changed.example.test/v1";
    form.cancelEdit();
    expect(form.settings.value).toEqual(stored);
    expect(form.keyConfigured.value).toBe(true);
    expect(api.saveSettings).not.toHaveBeenCalled();
    await form.save();
    expect(
      api.saveSettings.mock.calls[0]![0].profiles.every(
        (profile) => !("apiKey" in profile) && !("clearApiKey" in profile)
      )
    ).toBe(true);
  });

  it("automatically persists selections silently and restores a failed change", async () => {
    const { form, api, notifications } = setup();
    await form.load();
    await form.updateSelection("language", "en");
    await form.updateSelection("microphoneId", "test-microphone");
    await form.updateSelection("activeProfileId", "aliyun-api");
    expect(api.saveSettings.mock.calls[2]![0]).toMatchObject({
      language: "en",
      microphoneId: "test-microphone",
      activeProfileId: "aliyun-api"
    });
    expect(notifications.success).not.toHaveBeenCalled();
    api.saveSettings.mockRejectedValueOnce(new Error("保存失败"));
    await form.updateSelection("language", "zh");
    expect(form.settings.value.language).toBe("en");
    expect(notifications.error).toHaveBeenCalledWith("保存失败");
    await form.updateSelection("language", "en");
    expect(api.saveSettings).toHaveBeenCalledTimes(4);
  });

  it("retains usage when refreshing fails and clears unsaved credentials on disposal", async () => {
    const { form, api, notifications } = setup();
    await form.load();
    form.usage.value = [
      {
        requestId: "previous",
        profileId: "mimo-api",
        model: "test-asr",
        createdAt: "2026-09-28T00:00:00Z",
        durationMs: 1000
      }
    ];
    api.getUsage.mockRejectedValueOnce(new Error("无法读取语音用量"));
    await form.refreshUsage();
    expect(form.usage.value).toHaveLength(1);
    expect(notifications.error).toHaveBeenCalledWith("无法读取语音用量");
    form.apiKey.value = "test_only_invalid";
    form.dispose();
    expect(form.apiKey.value).toBe("");
    expect(await form.save()).toBe(false);
  });
});
