import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertElectronLaunchAllowed } from "./electron-launch-environment.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("Electron launch environment", () => {
  it("rejects macOS Codex launches with an actionable diagnostic", () => {
    const launch = () =>
      assertElectronLaunchAllowed({
        platform: "darwin",
        env: { CODEX_SANDBOX: "seatbelt" }
      });
    expect(launch).toThrow("申请沙盒外执行");
    expect(launch).toThrow("--no-sandbox");
    try {
      launch();
    } catch (error) {
      expect(error.code).toBe("DEEPWRITE_ELECTRON_SANDBOX");
    }
  });

  it.each([
    ["darwin", {}],
    ["darwin", { CODEX_THREAD_ID: "test-thread" }],
    ["linux", { CODEX_SANDBOX: "seatbelt" }],
    ["win32", { CODEX_SANDBOX: "seatbelt" }]
  ])("allows normal or supported %s execution", (platform, env) => {
    expect(() => assertElectronLaunchAllowed({ platform, env })).not.toThrow();
  });

  const launchers = [
    ["tools/run-desktop-dev.mjs"],
    ["tools/run-desktop-preview.mjs"],
    ["tools/run-test-package.mjs", "mac", "arm64"],
    ["tools/run-test-package.mjs", "desktop"],
    ["apps/desktop/scripts/verify-test-package.mjs", "mac", "arm64"],
    ["apps/desktop/scripts/electron-smoke.mjs"],
    ["apps/desktop/scripts/electron-conversation-smoke.mjs"],
    ["apps/desktop/scripts/electron-preload-error-smoke.mjs"],
    ["apps/desktop/scripts/electron-storage-smoke.mjs"],
    ["apps/desktop/scripts/electron-shutdown-smoke.mjs"],
    ["apps/desktop/scripts/conversation-vue-probe.mjs"],
    ["apps/desktop/scripts/analysis-page-probe.mjs"],
    ["apps/desktop/scripts/revision-analysis-probe.mjs"],
    ["apps/desktop/scripts/short-book-analysis-probe.mjs"]
  ];

  it.runIf(process.platform === "darwin").each(launchers)(
    "stops %s before native startup, fixtures or build preparation",
    (...args) => {
      const result = spawnSync(process.execPath, args, {
        cwd: root,
        env: { ...process.env, CODEX_SANDBOX: "seatbelt" },
        encoding: "utf8",
        timeout: 10_000
      });
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).toContain(
        "DEEPWRITE_ELECTRON_SANDBOX"
      );
    }
  );

  it.runIf(process.platform === "darwin")(
    "rejects direct packaged smoke calls before writing the profile",
    () => {
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          'import { runPackagedSmoke } from "./apps/desktop/scripts/package-smoke-runner.mjs"; await runPackagedSmoke("missing-executable", ".", "missing-profile", "mac");'
        ],
        {
          cwd: root,
          env: { ...process.env, CODEX_SANDBOX: "seatbelt" },
          encoding: "utf8",
          timeout: 10_000
        }
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("DEEPWRITE_ELECTRON_SANDBOX");
    }
  );
});
