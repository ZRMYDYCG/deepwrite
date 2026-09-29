import type { BrowserWindow } from "electron";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  i18nSmokeInRenderer,
  type I18nSmokeFixture
} from "./smoke-i18n-renderer";

export async function runI18nSmoke(window: BrowserWindow) {
  if (process.env.DEEPWRITE_SMOKE !== "1")
    throw new Error("Language smoke requires the isolated smoke profile.");
  window.setSize(1040, 780);
  window.showInactive();
  const run = (fixture?: I18nSmokeFixture) =>
    window.webContents.executeJavaScript(
      `(${i18nSmokeInRenderer.toString()})(${fixture ? JSON.stringify(fixture) : ""})`,
      true
    ) as Promise<I18nSmokeFixture>;
  const fixture = await run();
  await writeFile(
    join(tmpdir(), "deepwrite-i18n-settings.png"),
    (await window.capturePage()).toPNG()
  );
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Language smoke reload timed out.")),
      8_000
    );
    window.webContents.once("did-finish-load", () => {
      clearTimeout(timeout);
      resolve();
    });
    window.webContents.reload();
  });
  await run(fixture);
  return {
    status: "ok",
    settings: fixture.settingsCount,
    features: fixture.featuresCount,
    switchedBothWays: true,
    restoredAfterReload: true,
    userContentUnchanged: true,
    layout: true
  };
}
