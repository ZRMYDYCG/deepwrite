import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const root = resolve(scripts, "../../..");
const dist = join(root, "node_modules/electron/dist");
const binary =
  process.platform === "darwin"
    ? join(dist, "Electron.app/Contents/MacOS/Electron")
    : join(dist, process.platform === "win32" ? "electron.exe" : "electron");
const preload = join(root, "apps/desktop/out/preload/index.js");
await access(preload);
const profile = await mkdtemp(join(tmpdir(), "deepwrite-preload-error-smoke-"));
try {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    binary,
    [join(scripts, "fixtures/preload-error-smoke-main.mjs")],
    {
      env: {
        ...environment,
        DEEPWRITE_ERROR_SMOKE_PROFILE: profile,
        DEEPWRITE_ERROR_SMOKE_PRELOAD: preload
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 30_000);
  const exit = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  }).finally(() => clearTimeout(timeout));
  assert.equal(exit, 0, output);
  assert.ok(output.includes("DEEPWRITE_PRELOAD_ERROR_SMOKE_OK"), output);
  console.log(
    "Preload errors retain validated codes and details across Electron contextBridge."
  );
} finally {
  await rm(profile, { recursive: true, force: true });
}
