import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ImageModelSettings,
  ImageModelSettingsInput
} from "@deepwrite/contracts/renderer";
import { useImageModelSettings } from "./useImageModelSettings";
function fixture(): ImageModelSettings {
  return {
    activeProfileId: "img_active",
    profiles: [
      {
        id: "img_active",
        presetId: "openai-compatible",
        name: "Active",
        baseUrl: "https://images.example.test/v1",
        model: "test-image",
        defaultAspectRatio: "1:1",
        hasApiKey: true
      },
      {
        id: "img_empty",
        presetId: "openai-compatible",
        name: "No key",
        baseUrl: "https://images.example.test/v1",
        model: "test-image",
        defaultAspectRatio: "1:1",
        hasApiKey: false
      }
    ]
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("image settings editor", () => {
  it("can edit a configuration without a key and preserves other configurations and secrets", async () => {
    const stored = fixture();
    const saveSettings = vi.fn(async (input: ImageModelSettingsInput) => ({
      ...input,
      profiles: input.profiles.map(({ apiKey, clearApiKey, id, ...p }) => ({
        ...p,
        id: id ?? "img_new",
        hasApiKey:
          !clearApiKey &&
          (Boolean(apiKey) ||
            Boolean(stored.profiles.find((s) => s.id === id)?.hasApiKey))
      }))
    }));
    vi.stubGlobal("window", {
      deepwrite: {
        imageModels: { getSettings: async () => stored, saveSettings }
      }
    });
    const c = useImageModelSettings();
    await c.load();
    c.edit(false, "img_empty");
    expect(c.draft.value?.name).toBe("No key");
    c.draft.value!.apiKey = "invalid_test_key";
    await c.save();
    const input = saveSettings.mock.calls[0]![0];
    expect(
      input.profiles.find((p) => p.id === "img_active")
    ).not.toHaveProperty("apiKey");
    expect(input.profiles.every((p) => !("hasApiKey" in p))).toBe(true);
    expect(c.draft.value).toBeNull();
    expect(
      c.settings.value.profiles.find((p) => p.id === "img_empty")?.hasApiKey
    ).toBe(true);
  });
  it("keeps a failed save editable without changing the saved settings", async () => {
    const stored = fixture();
    vi.stubGlobal("window", {
      deepwrite: {
        imageModels: {
          getSettings: async () => stored,
          saveSettings: async () => {
            throw new Error("test save rejected");
          }
        }
      }
    });
    const c = useImageModelSettings();
    await c.load();
    c.edit();
    c.draft.value!.name = "Changed";
    await c.save();
    expect(c.draft.value?.name).toBe("Changed");
    expect(c.settings.value.profiles[0]?.name).toBe("Active");
    expect(c.saving.value).toBe(false);
  });
});
