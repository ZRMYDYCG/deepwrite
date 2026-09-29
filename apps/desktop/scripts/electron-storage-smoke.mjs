import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const repository = resolve(scripts, "../../..");
const output = join(repository, "apps/desktop/out/main");
const electronDist = join(repository, "node_modules/electron/dist");
const electron =
  process.platform === "darwin"
    ? join(electronDist, "Electron.app/Contents/MacOS/Electron")
    : join(
        electronDist,
        process.platform === "win32" ? "electron.exe" : "electron"
      );
await Promise.all([
  access(electron),
  access(join(output, "index.js")),
  access(join(output, "utilities/storage-migration-entry.js"))
]);

const root = await realpath(
  await mkdtemp(join(tmpdir(), "deepwrite-storage-smoke-"))
);
const defaultPath = join(root, "default");
const customPath = join(root, "custom");
const anchor = join(root, ".default.storage-location.json");
const modelsFile = (profile) => join(profile, "config/models.json");
await Promise.all(
  [
    "default/config",
    "custom",
    "home",
    "documents",
    "app-data",
    "legacy",
    "workspace-custom"
  ].map((path) => mkdir(join(root, path), { recursive: true }))
);
await writeFile(
  join(defaultPath, "config/workspace-directory.json"),
  JSON.stringify({ version: 1, path: join(root, "workspace-custom") })
);

async function run(phase) {
  const environment = { ...process.env };
  for (const key of [
    "ELECTRON_RUN_AS_NODE",
    "ELECTRON_RENDERER_URL",
    "DEEPWRITE_USER_DATA_PATH",
    "DEEPWRITE_LEGACY_DATA_ROOT",
    "DEEPWRITE_LEGACY_DATA_ROOTS"
  ])
    delete environment[key];
  const child = spawn(
    electron,
    [
      join(scripts, "fixtures/storage-smoke-main.mjs"),
      `--user-data-dir=${defaultPath}`,
      "--no-sandbox"
    ],
    {
      cwd: root,
      env: {
        ...environment,
        DEEPWRITE_SMOKE: "1",
        DEEPWRITE_STORAGE_SMOKE: phase,
        DEEPWRITE_STORAGE_SMOKE_ROOT: root,
        DEEPWRITE_STORAGE_SMOKE_ENTRY: join(output, "index.js"),
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  let outputText = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (text) => {
      outputText += text;
    });
  }
  const timeout = setTimeout(() => child.kill("SIGKILL"), 45_000);
  let code;
  try {
    code = await new Promise((resolveExit, reject) => {
      child.once("error", reject);
      child.once("close", resolveExit);
    });
  } finally {
    clearTimeout(timeout);
  }
  const lines = outputText.split(/\r?\n/);
  const marker = lines.find((line) =>
    line.startsWith("DEEPWRITE_STORAGE_SMOKE_OK ")
  );
  if (code !== 0 || !marker) {
    // Only emit dedicated markers; startup logs may include local configuration.
    const failure = lines.find((line) =>
      line.startsWith("DEEPWRITE_STORAGE_SMOKE_FAIL ")
    );
    throw new Error(
      failure ?? `Storage smoke ${phase} failed (${String(code)}).`
    );
  }
  const summary = JSON.parse(
    marker.slice("DEEPWRITE_STORAGE_SMOKE_OK ".length)
  );
  assert.equal(summary.phase, phase);
  assert.equal(summary.status, "ok");
  if (phase === "seed") {
    assert.equal(summary.ui?.status, "ok");
    assert.equal(summary.ui?.cards, 2);
    assert.equal(summary.ui?.originalWorkspaceEntry, true);
    assert.equal(summary.ui?.themes, 3);
    assert.equal(summary.ui?.maxUiFontSize, 24);
  }
  for (const key of [
    "paths",
    "models",
    "history",
    "preferences",
    "chromiumStorage",
    "workspacePreserved",
    "encryptedCredential"
  ])
    assert.equal(summary[key], true, `${phase}: ${key}`);
  console.log(`Storage smoke passed: ${phase}.`);
}

async function migrate(sourcePath, targetPath, allowExistingTarget) {
  await writeFile(
    anchor,
    JSON.stringify({
      version: 1,
      currentPath: sourcePath,
      pending: {
        sourcePath,
        targetPath,
        allowExistingTarget,
        migrationId: `storage-smoke-${allowExistingTarget ? "restore" : "custom"}`
      }
    })
  );
}

async function assertAnchor(path) {
  const state = JSON.parse(await readFile(anchor, "utf8"));
  assert.equal(state.currentPath, path);
  assert.equal(state.pending, undefined);
}

try {
  await run("seed");
  const initialModels = await readFile(modelsFile(defaultPath), "utf8");
  assert.ok(!initialModels.includes("invalid-storage-smoke-placeholder"));
  await migrate(defaultPath, customPath, false);
  await run("custom");
  await assertAnchor(customPath);
  assert.equal(await readFile(modelsFile(defaultPath), "utf8"), initialModels);
  const customModels = await readFile(modelsFile(customPath), "utf8");
  assert.notEqual(customModels, initialModels);
  await migrate(customPath, defaultPath, true);
  await run("restored");
  await assertAnchor(defaultPath);
  assert.equal(await readFile(modelsFile(customPath), "utf8"), customModels);
  console.log(
    "Storage smoke passed: real Electron/Preload/Core, default and custom paths, encrypted models, SQLite history, Chromium preferences, workspace reset, profile isolation and return migration."
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
