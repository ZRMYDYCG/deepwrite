import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
vi.mock("electron", () => ({ systemPreferences: {} }));
import {
  installVoicePermissions,
  isTrustedVoiceFrame
} from "./voice-permissions";

describe("microphone permission boundary", () => {
  it("allows only the application's top frame", () => {
    const local = "file:///application/index.html";
    expect(isTrustedVoiceFrame(`${local}#settings`, local, true)).toBe(true);
    expect(isTrustedVoiceFrame(local, local, false)).toBe(false);
    expect(isTrustedVoiceFrame("https://other.example.test", local, true)).toBe(
      false
    );
    expect(isTrustedVoiceFrame(undefined, local, true)).toBe(false);
  });

  it("permits audio for the owning window and rejects video, guests and frames", () => {
    const check = vi.fn();
    const request = vi.fn();
    const contents = {
      getURL: () => "https://app.example.test/",
      session: {
        setPermissionCheckHandler: check,
        setPermissionRequestHandler: request
      }
    };
    installVoicePermissions({
      webContents: contents,
      isDestroyed: () => false
    } as unknown as BrowserWindow);
    const checkPermission = check.mock.calls[0]![0];
    const requestPermission = request.mock.calls[0]![0];
    const details = {
      requestingUrl: contents.getURL(),
      isMainFrame: true,
      mediaType: "audio"
    };
    expect(checkPermission(contents, "media", "", details)).toBe(true);
    expect(
      checkPermission(contents, "media", "", { ...details, mediaType: "video" })
    ).toBe(false);
    expect(checkPermission({}, "media", "", details)).toBe(false);
    const grant = vi.fn();
    requestPermission(contents, "media", grant, {
      ...details,
      mediaTypes: ["audio"]
    });
    expect(grant).toHaveBeenLastCalledWith(true);
    requestPermission(contents, "media", grant, {
      ...details,
      mediaTypes: ["audio", "video"]
    });
    expect(grant).toHaveBeenLastCalledWith(false);
    requestPermission(contents, "media", grant, {
      ...details,
      isMainFrame: false,
      mediaTypes: ["audio"]
    });
    expect(grant).toHaveBeenLastCalledWith(false);
  });
});
