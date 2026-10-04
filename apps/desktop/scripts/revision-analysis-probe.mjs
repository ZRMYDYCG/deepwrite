import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { assertElectronLaunchAllowed } from "../../../tools/electron-launch-environment.mjs";

assertElectronLaunchAllowed();

const root = fileURLToPath(new URL("../../..", import.meta.url));
const output =
  process.argv[2] ?? join(tmpdir(), "deepwrite-revision-analysis-probe");
async function scrollToBottom(win) {
  for (let i = 0; i < 10; i++) {
    win.webContents.sendInputEvent({
      type: "mouseWheel",
      x: 20,
      y: 400,
      deltaX: 0,
      deltaY: -1000,
      canScroll: true
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const metrics = await win.webContents.executeJavaScript(
    "inspectRevisionScrollProbe()"
  );
  for (const name of ["hostScroll", "shellScroll", "appScroll"]) {
    if (metrics[name] !== 0)
      throw new Error(`Analysis moved ${name} by ${metrics[name]}px`);
  }
  if (metrics.top < 0 || metrics.bottom > metrics.viewportHeight + 1)
    throw new Error("Analysis viewport must stay inside the window");
  if (
    Math.abs(metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop) >
    1
  )
    throw new Error(
      "Mouse wheel must reach the bottom after analysis completes"
    );
  if (metrics.saveTop < 0 || metrics.saveBottom > metrics.viewportHeight + 1)
    throw new Error("Save controls must be visible at the bottom");
  return metrics;
}
if (process.argv.includes("--electron")) {
  const { app, BrowserWindow } = await import("electron");
  app.setPath(
    "userData",
    await mkdtemp(join(tmpdir(), "revision-analysis-profile-"))
  );
  void app.whenReady().then(async () => {
    const win = new BrowserWindow({
      width: 1100,
      height: 900,
      show: false,
      webPreferences: { backgroundThrottling: false }
    });
    win.webContents.on("console-message", (event) => {
      if (event.level === "error") console.error(event.message);
    });
    try {
      await mkdir(output, { recursive: true });
      await win.loadURL(process.argv[4]);
      await win.webContents.executeJavaScript(
        "new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(window.runRevisionAnalysisProbe){clearInterval(timer);resolve();}else if(Date.now()-start>15000){clearInterval(timer);reject(new Error('Fixture timeout'));}},20);})"
      );
      const interactions = await win.webContents.executeJavaScript(
        "runRevisionAnalysisProbe()"
      );
      const scrollSamples = [];
      for (const collapsed of [false, true]) {
        for (const length of [1, 60, 3]) {
          const before = await win.webContents.executeJavaScript(
            `runRevisionScrollProbe(${collapsed}, ${length})`
          );
          const after = await scrollToBottom(win);
          scrollSamples.push({ before, after });
        }
      }
      const samples = [];
      for (const [scheme, size, width, height, modal, state = "page"] of [
        ["light", 14, 1200, 950, false],
        ["dark", 14, 1200, 950, false],
        ["light", 24, 640, 800, false],
        ["dark", 24, 640, 800, false],
        ["light", 14, 1200, 950, false, "process"],
        ["dark", 24, 640, 800, false, "process"],
        ["light", 14, 1200, 950, false, "results"],
        ["dark", 24, 640, 800, false, "results"],
        ["light", 24, 640, 800, true, "menu"]
      ]) {
        win.setContentSize(width, height);
        samples.push(
          await win.webContents.executeJavaScript(
            `showRevisionAnalysisProbe('${scheme}',${size},${modal},'${state}')`
          )
        );
        if (state === "results")
          samples.at(-1).bottom = await scrollToBottom(win);
        await writeFile(
          join(output, `${scheme}-${size}-${modal ? "preset" : state}.png`),
          (await win.capturePage()).toPNG()
        );
      }
      await writeFile(
        join(output, "result.json"),
        JSON.stringify({ interactions, scrollSamples, samples }, null, 2)
      );
      console.log(JSON.stringify({ interactions, scrollSamples, samples }));
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    } finally {
      win.destroy();
      app.exit(process.exitCode ?? 0);
    }
  });
} else {
  const { createServer } = await import("vite");
  const { default: vue } = await import("@vitejs/plugin-vue");
  const require = createRequire(import.meta.url);
  const server = await createServer({
    root,
    configFile: false,
    publicDir: resolve(root, "apps/desktop/src/renderer/public"),
    plugins: [vue()],
    server: { port: 0, hmr: false },
    resolve: {
      alias: [
        {
          find: "@deepwrite/contracts/renderer",
          replacement: resolve(root, "packages/contracts/src/renderer.ts")
        }
      ]
    }
  });
  try {
    await server.listen();
    const url = new URL(
      "apps/desktop/scripts/fixtures/revision-analysis-probe.html",
      server.resolvedUrls.local[0]
    );
    const child = spawn(
      require("electron"),
      [fileURLToPath(import.meta.url), output, "--electron", url.href],
      { stdio: "inherit" }
    );
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`Electron probe exited: ${signal ?? code}`));
      });
    });
  } finally {
    await server.close();
  }
}
