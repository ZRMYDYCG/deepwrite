import type { BrowserWindow } from "electron";
import type { ChatAssistantProjectRef } from "@deepwrite/contracts";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { captureIdentitySettings } from "./smoke-book-identity-settings";
import { createIdentitySmokeUi } from "./smoke-book-identity-ui";
import {
  checkIdentityAdoption,
  observeIdentityAdoption
} from "./smoke-book-identity-adoption";
import { checkIdentityAdoptionVariants } from "./smoke-book-identity-adoption-variants";

async function identityVisualStep(
  makeUi: typeof createIdentitySmokeUi,
  theme: "light" | "dark",
  fontSize: number,
  templateLabel: string | null,
  settingsOnly = false
) {
  const { pause, until, click } = makeUi();
  function primaryColor() {
    const sample = document.createElement("span");
    sample.style.color = "var(--text-primary)";
    document.body.append(sample);
    const color = getComputedStyle(sample).color;
    sample.remove();
    return color;
  }
  if (templateLabel === null) {
    if (!document.querySelector(".settings-nav"))
      await click(".identity-header-actions .identity-image-model");
    if (settingsOnly) {
      await until(
        () => document.querySelector(".image-config-list"),
        "image model settings loaded"
      );
      const label = await until(
        () =>
          document.querySelector<HTMLElement>(
            ".image-current-model .settings-item-text"
          ),
        "current image model identity"
      );
      if (label.getBoundingClientRect().width < 120)
        throw new Error(
          "Current image model identity is squeezed by its selector."
        );
      return { theme, fontSize, kind: "image-model-settings" };
    }
    const appearance = await until(
      () =>
        [
          ...document.querySelectorAll<HTMLButtonElement>(
            ".settings-nav button"
          )
        ].find((button) => button.textContent?.trim() === "外观"),
      "appearance section"
    );
    appearance.click();
    await until(() => {
      const form = document.querySelector<HTMLFieldSetElement>(
        ".appearance-settings-content"
      );
      return form && !form.disabled ? form : null;
    }, "appearance form");
    const mode = await until(
      () =>
        [
          ...document.querySelectorAll<HTMLButtonElement>(
            ".theme-mode-grid button"
          )
        ].find(
          (button) =>
            button.textContent?.trim() === (theme === "light" ? "浅色" : "深色")
        ),
      "theme mode"
    );
    mode.click();
    for (const [label, value] of [
      ["UI 字号（像素）", String(fontSize)],
      ["输入强调色", "#9057FF"],
      ["输入背景色", theme === "dark" ? "#151C25" : "#FFF8EF"],
      ["输入前景色", theme === "dark" ? "#EDF4FF" : "#271E16"]
    ]) {
      const input = await until(
        () =>
          document.querySelector<HTMLInputElement>(
            `input[aria-label="${label}"]`
          ),
        `theme input ${label}`
      );
      input.value = value!;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await until(
      () =>
        document.documentElement.dataset.theme === theme &&
        getComputedStyle(document.documentElement)
          .getPropertyValue("--ui-font-size")
          .trim() === `${fontSize}px` &&
        getComputedStyle(document.documentElement)
          .getPropertyValue("--accent")
          .trim()
          .toUpperCase() === "#9057FF",
      "live theme variables"
    );
    await click(".settings-back");
    await until(
      () => document.querySelector(".book-identity-page"),
      "return to identity page"
    );
    const coverTab = await until(
      () =>
        document.querySelectorAll<HTMLButtonElement>(
          ".identity-tabs button"
        )[2],
      "cover tab after settings"
    );
    coverTab.click();
    await until(() => {
      const image = document.querySelector<HTMLImageElement>(
        ".identity-candidate .identity-cover-image img"
      );
      return image?.complete && image.naturalWidth > 0 ? image : null;
    }, "persisted cover cards after settings");
    const generate = await until(
      () =>
        document.querySelector<HTMLButtonElement>(
          ".identity-generation .analysis-primary-button"
        ),
      "generation primary action"
    );
    if (getComputedStyle(generate).backgroundColor !== primaryColor())
      throw new Error(
        "Generation primary action does not use the neutral solid background."
      );
    const page = document.querySelector<HTMLElement>(".book-identity-page")!;
    page.scrollTop = 0;
    page.scrollIntoView({ block: "start" });
    return { theme, fontSize, kind: "page" };
  }
  if (!document.querySelector(".identity-composer")) {
    const compose = await until(
      () =>
        [
          ...document.querySelectorAll<HTMLButtonElement>(
            ".book-identity-page .identity-candidate button"
          )
        ].find(
          (button) => button.textContent?.trim() === "排版" && !button.disabled
        ),
      "cover composition action"
    );
    compose.click();
    await until(() => {
      const image = document.querySelector<HTMLImageElement>(
        ".identity-composer-preview img"
      );
      return image?.complete && image.naturalWidth === 600 ? image : null;
    }, "initial composed preview");
  }
  const previous = document.querySelector<HTMLImageElement>(
    ".identity-composer-preview img"
  )!.src;
  const selector =
    '.identity-composer .popup-select-trigger[aria-label="版式"]';
  const trigger = document.querySelector<HTMLButtonElement>(selector)!;
  const previousLabel = trigger.textContent?.trim();
  await click(selector);
  const menu = await until(() => {
    const id = trigger.getAttribute("aria-controls");
    return id ? document.getElementById(id) : null;
  }, "layout menu");
  const options = [
    ...menu.querySelectorAll<HTMLButtonElement>("[role=option]")
  ];
  if (
    ![
      "顶部左对齐",
      "顶部居中",
      "顶部右对齐",
      "居中左对齐",
      "居中对齐",
      "居中右对齐",
      "底部左对齐",
      "底部居中",
      "底部右对齐",
      "左侧竖排",
      "右侧竖排"
    ].every((label) =>
      options.some((option) => option.textContent?.trim() === label)
    )
  )
    throw new Error("Cover composition layouts missing from the menu.");
  const option = options.find(
    (option) => option.textContent?.trim() === templateLabel
  )!;
  option.scrollIntoView({ block: "nearest" });
  await until(() => {
    const rect = option.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
    return hit && option.contains(hit);
  }, "layout menu above the dialog");
  option.click();
  await until(
    () => trigger.textContent?.trim() === templateLabel,
    "layout selection"
  );
  if (previousLabel !== templateLabel)
    await until(() => {
      const image = document.querySelector<HTMLImageElement>(
        ".identity-composer-preview img"
      );
      return image?.complete && image.src !== previous ? image : null;
    }, "layout recomposed");
  await until(() => !document.getElementById(menu.id), "layout menu closed");
  await pause();
  const modal = document.querySelector<HTMLElement>(".identity-composer")!;
  const rect = modal.getBoundingClientRect();
  if (rect.width > innerWidth + 1)
    throw new Error("Composition modal exceeds the compact viewport.");
  const preview = modal.querySelector<HTMLImageElement>(
    ".identity-composer-preview img"
  )!;
  const imageRect = preview.getBoundingClientRect();
  const footer = document.querySelector<HTMLElement>(
    ".analysis-preset-modal > footer"
  )!;
  const footerRect = footer.getBoundingClientRect();
  if (
    imageRect.left < rect.left - 2 ||
    imageRect.right > rect.right + 2 ||
    imageRect.top < rect.top - 2 ||
    imageRect.bottom > Math.min(rect.bottom, footerRect.top) + 2
  )
    throw new Error(
      `Composed preview is clipped by its body or footer: ${JSON.stringify({ image: imageRect.toJSON(), body: rect.toJSON(), footer: footerRect.toJSON() })}`
    );
  const cancel = footer.querySelector<HTMLButtonElement>("button")!;
  const primary = footer.querySelector<HTMLButtonElement>(
    ".analysis-primary-button"
  )!;
  const primaryBackground = getComputedStyle(primary).backgroundColor;
  if (
    primaryBackground === getComputedStyle(cancel).backgroundColor ||
    primaryBackground !== primaryColor()
  )
    throw new Error(
      "Composition primary action does not use a distinct neutral solid background."
    );
  const fontLabel = modal.querySelector<HTMLElement>(
    '.popup-select-trigger[aria-label="字体"] .popup-select-label'
  );
  if (
    !fontLabel?.textContent?.trim() ||
    fontLabel.classList.contains("is-placeholder")
  )
    throw new Error(
      "Saved composition font is displayed as an empty selection."
    );
  return { theme, fontSize, kind: "composer", templateLabel };
}

export async function runIdentityVisualSmoke(
  window: BrowserWindow,
  book: ChatAssistantProjectRef
) {
  window.showInactive();
  window.webContents.setBackgroundThrottling(false);
  const directory = await mkdtemp(join(tmpdir(), "deepwrite-identity-visual-"));
  const captures = [];
  const settingsCaptures = [];
  const adoptionChecks = [];
  for (const [name, theme, fontSize, width, template, settingsOnly] of [
    ["image-model-settings", "light", 14, 1200, null, true],
    ["light", "light", 14, 1200, null, false],
    ["dark", "dark", 14, 1200, null, false],
    ["compact-large", "light", 24, 1120, null, false],
    ["top-center", "light", 24, 1120, "顶部居中", false],
    ["bottom-horizontal", "light", 24, 1120, "底部居中", false],
    ["right-vertical", "light", 24, 1120, "右侧竖排", false],
    ["center-overlay", "light", 24, 1120, "居中对齐", false],
    ["center-left", "light", 24, 1120, "居中左对齐", false],
    ["bottom-right", "light", 24, 1120, "底部右对齐", false],
    ["left-vertical", "light", 24, 1120, "左侧竖排", false]
  ] as const) {
    window.setSize(width, 780);
    try {
      const state = await window.webContents.executeJavaScript(
        `(${identityVisualStep.toString()})(${createIdentitySmokeUi.toString()},${JSON.stringify(theme)},${fontSize},${JSON.stringify(template)},${settingsOnly})`
      );
      const path = join(directory, `${name}.png`);
      await writeFile(path, (await window.capturePage()).toPNG());
      captures.push({ ...state, path });
      if (state.kind === "page") {
        const checks = await window.webContents.executeJavaScript(
          `(${checkIdentityAdoptionVariants.toString()})(${createIdentitySmokeUi.toString()},${observeIdentityAdoption.toString()},${checkIdentityAdoption.toString()},${JSON.stringify(book)})`
        );
        adoptionChecks.push({ theme, fontSize, width, ...checks });
        settingsCaptures.push(
          await captureIdentitySettings(
            window,
            join(directory, `${name}-generation-settings.png`)
          )
        );
      }
    } catch (error) {
      const path = join(directory, `${name}-failure.png`);
      await writeFile(path, (await window.capturePage()).toPNG());
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; Screenshot: ${path}`,
        { cause: error }
      );
    }
  }
  return { status: "ok", captures, settingsCaptures, adoptionChecks };
}
