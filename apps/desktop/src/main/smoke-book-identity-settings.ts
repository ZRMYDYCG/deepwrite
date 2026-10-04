import type { BrowserWindow } from "electron";
import { writeFile } from "node:fs/promises";
import { createIdentitySmokeUi } from "./smoke-book-identity-ui";

async function checkSettings(makeUi: typeof createIdentitySmokeUi) {
  const { click, until } = makeUi();
  await click(".identity-settings-trigger");
  const dialog = await until(
    () => document.querySelector<HTMLElement>(".identity-settings-dialog"),
    "generation settings dialog"
  );
  const bounds = dialog.getBoundingClientRect();
  if (
    bounds.left < 0 ||
    bounds.right > innerWidth ||
    bounds.top < 0 ||
    bounds.bottom > innerHeight
  )
    throw new Error("Generation settings exceed the viewport.");
  if (bounds.width > 602)
    throw new Error("Generation settings are unnecessarily wide.");
  const body = dialog.querySelector<HTMLElement>(
    ".identity-generation-settings"
  )!;
  if (body.scrollWidth > body.clientWidth + 1)
    throw new Error("Generation settings overflow horizontally.");
  const footer = dialog.querySelector<HTMLElement>("footer")!;
  if (footer.getBoundingClientRect().bottom > innerHeight)
    throw new Error("Generation settings action is clipped.");
  const sample = document.createElement("span");
  sample.style.backgroundColor = "var(--surface-raised)";
  document.body.append(sample);
  const expectedBackground = getComputedStyle(sample).backgroundColor;
  sample.remove();
  if (getComputedStyle(dialog).backgroundColor !== expectedBackground)
    throw new Error("Generation settings do not follow the current theme.");
  await click(
    '.identity-generation-settings .popup-select-trigger[aria-label="档案"]'
  );
  const option = await until(
    () => document.querySelector<HTMLButtonElement>(".popup-select-option"),
    "profile options above the settings dialog"
  );
  const optionBounds = option.getBoundingClientRect();
  const topElement = document.elementFromPoint(
    optionBounds.left + optionBounds.width / 2,
    optionBounds.top + optionBounds.height / 2
  );
  if (!topElement || !option.contains(topElement))
    throw new Error("Profile options are covered by the settings dialog.");
  option.click();
}

export async function captureIdentitySettings(
  window: BrowserWindow,
  path: string
) {
  await window.webContents.executeJavaScript(
    `(${checkSettings.toString()})(${createIdentitySmokeUi.toString()})`
  );
  await writeFile(path, (await window.capturePage()).toPNG());
  await window.webContents.executeJavaScript(
    `document.querySelector('.identity-settings-dialog footer .analysis-primary-button').click()`
  );
  return path;
}
