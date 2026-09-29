import { nativeText, nativeMessages } from "./native-i18n";
import { app, crashReporter, dialog } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  createStartupController,
  type StartupPhase
} from "./startup-controller";
import { createStartupLog, startupErrorCode } from "./startup-log";

const phaseLabelKeys: Record<StartupPhase, Parameters<typeof nativeText>[0]> = {
  runtime: "startupRuntime",
  services: "startupServices",
  workspace: "startupWorkspace",
  appearance: "startupAppearance",
  settings: "startupSettings",
  utilities: "startupUtilities",
  window: "startupWindow"
};

/** Install before app readiness so native startup crashes can leave a local dump. */
export function createDesktopStartup() {
  const directory = join(app.getPath("userData"), "diagnostics");
  const log = createStartupLog(directory);
  log.write(
    `start.${app.getVersion()}.${process.platform}.${process.arch}.electron-${process.versions.electron}`
  );
  try {
    const crashes = join(directory, "crashes");
    mkdirSync(crashes, { recursive: true });
    app.setPath("crashDumps", crashes);
    crashReporter.start({ uploadToServer: false });
    log.write("crash-reporter.ready");
  } catch (error) {
    log.write("crash-reporter.failed", { error });
  }
  process.on("uncaughtExceptionMonitor", (error) =>
    log.write("main.uncaught-exception", { error })
  );
  app.on("child-process-gone", (_event, details) => {
    log.write("child-process.gone", {
      processType: details.type,
      reason: details.reason,
      exitCode: details.exitCode
    });
  });
  app.on("render-process-gone", (_event, _contents, details) => {
    log.write("renderer.gone", {
      reason: details.reason,
      exitCode: details.exitCode
    });
  });
  return createStartupController(log, (phase, error) => {
    const code = startupErrorCode(error);
    try {
      if (process.env.DEEPWRITE_SMOKE === "1") {
        console.error(`DEEPWRITE_STARTUP_FAIL phase=${phase} code=${code}`);
      } else {
        dialog.showErrorBox(
          nativeText("startupFailure"),
          nativeMessages().startupDetails(
            nativeText(phaseLabelKeys[phase]),
            code,
            phase === "workspace" || phase === "settings",
            log.path
          )
        );
      }
    } finally {
      // The renderer/IPC may not exist yet; the ordinary save-before-quit flow cannot run here.
      app.exit(1);
    }
  });
}
