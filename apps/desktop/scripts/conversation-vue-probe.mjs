import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { assertElectronLaunchAllowed } from "../../../tools/electron-launch-environment.mjs";

assertElectronLaunchAllowed();

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const root = resolve(workspaceRoot, "apps/desktop");
const fixture = process.argv.includes("--context-only")
  ? "composer-context-probe.html"
  : process.argv.includes("--composer-only")
    ? "composer-layout-probe.html"
    : process.argv.includes("--management-only")
      ? "conversation-management-probe.html"
      : "conversation-vue-probe.html";
const require = createRequire(import.meta.url);
const output = process.argv[2];
if (!output) throw new Error("Provide a JSON result path.");
const cacheDir = await mkdtemp(join(tmpdir(), "deepwrite-vue-probe-vite-"));
const server = await createServer({
  root,
  cacheDir,
  publicDir: resolve(root, "src/renderer/public"),
  configFile: false,
  plugins: [vue()],
  optimizeDeps: {
    entries: [resolve(root, "scripts/fixtures", fixture)],
    include: ["vue", "pinia", "vue-i18n", "naive-ui"]
  },
  server: {
    port: 0,
    hmr: false,
    watch: { ignored: ["**/out/**", "**/.git/**"] }
  },
  resolve: {
    // Fixtures and product SFCs must use one runtime for slots and injections.
    dedupe: ["vue", "pinia", "vue-i18n"],
    alias: [
      {
        find: "@deepwrite/contracts/renderer",
        replacement: resolve(
          workspaceRoot,
          "packages/contracts/src/renderer.ts"
        )
      },
      {
        find: "@deepwrite/contracts",
        replacement: resolve(
          workspaceRoot,
          "packages/contracts/src/renderer.ts"
        )
      }
    ]
  }
});
try {
  // A failed launch must never be mistaken for a result from a previous run.
  await rm(output, { force: true });
  await server.listen();
  const url = new URL(
    `scripts/fixtures/${fixture}`,
    server.resolvedUrls.local[0]
  );
  const child = spawn(
    require("electron"),
    [
      fileURLToPath(
        new URL("conversation-vue-probe-electron.mjs", import.meta.url)
      ),
      process.argv[2],
      url.href,
      ...process.argv.slice(3)
    ],
    { stdio: "inherit" }
  );
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => {
      if (signal) reject(new Error(`Electron probe terminated by ${signal}`));
      else resolve(exitCode ?? 1);
    });
  });
  if (code !== 0) process.exitCode = Number(code);
  else {
    const result = JSON.parse(await readFile(output, "utf8"));
    if (!result || typeof result !== "object")
      throw new Error("Electron probe produced an invalid JSON result.");
  }
} finally {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}
