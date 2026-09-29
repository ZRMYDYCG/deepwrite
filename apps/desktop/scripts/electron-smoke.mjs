import { prepareSmokeWorkspace } from "./smoke-workspace.mjs";
import { access, mkdtemp, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const i18nOnly = process.argv.includes("--i18n-only");
const workspaceRoot = resolve(appDir, "../..");
const electronDist = resolve(workspaceRoot, "node_modules/electron/dist");
const electronBinary =
  process.platform === "darwin"
    ? resolve(electronDist, "Electron.app/Contents/MacOS/Electron")
    : process.platform === "win32"
      ? resolve(electronDist, "electron.exe")
      : resolve(electronDist, "electron");

try {
  await access(resolve(appDir, "out/main/index.js"));
  await access(
    resolve(appDir, "out/main/utilities/conversation-storage/worker-entry.js")
  );
  await access(electronBinary);
} catch {
  console.error(
    "Desktop build or Electron binary is missing. Run `pnpm build` first."
  );
  process.exit(1);
}

const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const hasXvfb =
  spawnSync("sh", ["-c", "command -v xvfb-run"], { encoding: "utf8" })
    .status === 0;
const smokeUserData = await mkdtemp(
  join(tmpdir(), "deepwrite-electron-smoke-")
);
await prepareSmokeWorkspace(smokeUserData);
const command = !hasDisplay && hasXvfb ? "xvfb-run" : electronBinary;
const args =
  !hasDisplay && hasXvfb
    ? [
        "-a",
        electronBinary,
        ".",
        `--user-data-dir=${smokeUserData}`,
        "--use-fake-device-for-media-stream"
      ]
    : [
        ".",
        `--user-data-dir=${smokeUserData}`,
        "--use-fake-device-for-media-stream"
      ];

const child = spawn(command, args, {
  cwd: appDir,
  env: {
    ...process.env,
    DEEPWRITE_SMOKE: "1",
    DEEPWRITE_SMOKE_SUITE: i18nOnly ? "i18n" : "all",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

const timeout = setTimeout(() => {
  child.kill("SIGKILL");
}, 40_000);

child.on("close", async (code) => {
  clearTimeout(timeout);
  await rm(smokeUserData, { recursive: true, force: true });
  const marker = output
    .split(/\r?\n/)
    .find((line) => line.startsWith("DEEPWRITE_SMOKE_OK "));

  if (code !== 0 || !marker) {
    console.error(output.trim());
    console.error(`Electron smoke failed with exit code ${String(code)}.`);
    process.exit(1);
  }

  const summary = JSON.parse(marker.slice("DEEPWRITE_SMOKE_OK ".length));
  const localizationPassed =
    summary.localization?.status === "ok" &&
    summary.localization?.settings >= 14 &&
    summary.localization?.features >= 9 &&
    summary.localization?.switchedBothWays === true &&
    summary.localization?.restoredAfterReload === true &&
    summary.localization?.userContentUnchanged === true &&
    summary.localization?.layout === true;
  if (
    summary.health?.status !== "ok" ||
    summary.health?.workers?.length !== 3
  ) {
    console.error(
      `Electron smoke returned unhealthy utilities: ${JSON.stringify(summary)}`
    );
    process.exit(1);
  }

  if (i18nOnly) {
    if (!localizationPassed) {
      console.error("Electron language smoke returned an invalid summary.");
      process.exit(1);
    }
    console.log(
      "Electron language smoke passed: English settings and feature navigation, two-way switching, reload persistence and unchanged saved manuscripts."
    );
    return;
  }
  if (
    summary.bookTemplates?.status !== "ok" ||
    summary.bookTemplates?.created !== 4 ||
    summary.extrasAgents?.status !== "ok" ||
    summary.extrasAgents?.runtime !== "local-faux" ||
    summary.extrasAgents?.styleResult !== true ||
    summary.extrasAgents?.longNote !== true ||
    summary.extrasAgents?.profileRoundTrip !== true ||
    summary.extrasAgents?.modelRequired !== true ||
    summary.extrasChat?.status !== "ok" ||
    summary.extrasChat?.runtime !== "local-faux" ||
    summary.extrasChat?.turns !== 2 ||
    summary.extrasChat?.roleplay !== true ||
    summary.extrasChat?.projectRejected !== true ||
    summary.contextCompaction?.status !== "ok" ||
    summary.contextCompaction?.workspace !== true ||
    summary.contextCompaction?.chat !== true ||
    summary.contextCompaction?.persisted !== true ||
    summary.contextCompaction?.coldRestore !== true ||
    summary.voice?.status !== "ok" ||
    summary.voice?.profiles !== 4 ||
    summary.voice?.isolatedUsage !== true ||
    summary.voice?.cancelled !== true ||
    summary.voice?.secretsHidden !== true ||
    summary.voiceUi?.status !== "ok" ||
    summary.voiceUi?.settingsTest !== true ||
    summary.voiceUi?.chatDraft !== true ||
    summary.voiceUi?.cancelled !== true ||
    !localizationPassed ||
    summary.agent?.status !== "ok" ||
    summary.agent?.runtime?.mode !== "local-faux" ||
    summary.agent?.deltaCount < 2 ||
    summary.agent?.thinkingDeltaCount < 1 ||
    summary.agent?.completed !== true ||
    summary.conversation?.status !== "ok" ||
    summary.conversation?.staged !== true ||
    summary.conversation?.reopened !== false ||
    !(summary.conversation?.chunkPages >= 2) ||
    !(summary.conversation?.metadataChunkPages >= 2) ||
    summary.conversation?.unknownRetained !== true ||
    summary.conversation?.proposalRetained !== true
  ) {
    console.error(
      `Electron smoke returned an invalid agent summary: ${JSON.stringify(summary)}`
    );
    process.exit(1);
  }

  console.log(
    "Electron smoke passed: healthy utilities, Pi/Faux completion, and Renderer-to-SQLite persistence; template CRUD; extras agents and chat; writing/chat compaction; MiMo/Ali voice profiles, real UI recording with a fake microphone, transcription, cancellation, secret protection and isolated usage; live language switching, English navigation, reload persistence and unchanged manuscripts."
  );
});
