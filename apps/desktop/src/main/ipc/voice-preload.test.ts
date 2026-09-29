import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultVoiceSettings } from "@deepwrite/contracts";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../../preload/invoke", () => ({
  invokeCommand: invoke,
  browserId: () => "voice_command_test"
}));
import { voice } from "../../preload/voice-api";

describe("voice preload validation", () => {
  beforeEach(() => invoke.mockReset());
  it("validates responses before exposing settings", async () => {
    const settings = createDefaultVoiceSettings();
    invoke.mockResolvedValue(settings);
    await expect(voice.getSettings()).resolves.toEqual(settings);
    invoke.mockResolvedValue({ ...settings, apiKey: "invalid-placeholder" });
    await expect(voice.getSettings()).rejects.toThrow();
  });
  it("rejects invalid recording input without invoking IPC", async () => {
    await expect(
      voice.transcribe({
        requestId: "voice_test",
        profileId: "mimo-api",
        audioBase64: "invalid",
        durationMs: 200_000
      })
    ).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
  it("validates cancellation and OS permission replies", async () => {
    invoke.mockResolvedValue({ cancelled: true });
    await voice.cancel({ requestId: "voice_test" });
    expect(invoke.mock.calls[0]![0]).toMatchObject({
      type: "voice.cancel",
      payload: { requestId: "voice_test" }
    });
    invoke.mockResolvedValue("granted");
    await expect(voice.requestMicrophoneAccess()).rejects.toThrow();
  });
});
