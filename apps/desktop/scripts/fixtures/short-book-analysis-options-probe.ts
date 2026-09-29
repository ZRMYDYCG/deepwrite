import type { CatalogSnapshot } from "@deepwrite/contracts/renderer";
import { t } from "../../src/renderer/src/i18n";
import { thinkingLabel } from "../../src/renderer/src/components/modelSettingsDraft";

const library = {
  id: "probe-material-library",
  title: "验证素材库",
  materialKind: "mixed",
  materialType: "short",
  parentGenre: "",
  subGenre: "",
  overview: "",
  entries: [],
  projectRevision: 7,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};
export const probeCatalog = {
  materials: [library],
  skills: []
} as unknown as CatalogSnapshot;
export const savedProbeEntries: unknown[] = [];
type Frame = () => Promise<void>;
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  check(found, `Missing ${selector}`);
  return found;
}
async function choose(label: string, text: string, frame: Frame) {
  element<HTMLButtonElement>(
    `[role="combobox"][aria-label="${label}"]`
  ).click();
  await frame();
  const option = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]')
  ].find((item) => item.textContent?.includes(text));
  check(option, `Missing option ${text}`);
  option.click();
  await frame();
}
export async function verifyHeaderModelSettings(frame: Frame) {
  check(
    !document.querySelector(".setup-card .analysis-settings"),
    "Pre-run settings are removed"
  );
  check(
    !document.querySelector(".preset-target-field"),
    "No library destination before analysis"
  );
  const trigger = element<HTMLButtonElement>(
    ".analysis-page-header .analysis-model-trigger"
  );
  trigger.click();
  await frame();
  check(
    document.querySelector(".analysis-model-panel"),
    "Header opens model settings"
  );
  await choose(
    t("extras.longBookAnalysis.analysisModel"),
    "验证推理模型",
    frame
  );
  await choose(
    t("extras.longBookAnalysis.thinkingLevel"),
    thinkingLabel("high"),
    frame
  );
  trigger.click();
  await frame();
}
export function verifyEmptyResultDestination() {
  const select = element<HTMLButtonElement>(".result-save-row [role=combobox]");
  check(
    select.textContent?.includes(t("extras.longBookAnalysis.chooseLibrary")),
    "New result starts with an empty destination"
  );
  check(
    element<HTMLButtonElement>(".result-save-row > button").disabled,
    "Saving needs an explicit library choice"
  );
}
export async function verifyManualResultSave(frame: Frame) {
  verifyEmptyResultDestination();
  check(
    savedProbeEntries.length === 0,
    "Generating a result must not save it automatically"
  );
  await choose(
    t("extras.longBookAnalysis.resultTargetLibrary"),
    library.title,
    frame
  );
  const save = element<HTMLButtonElement>(".result-save-row > button");
  check(!save.disabled, "Choosing a compatible library enables saving");
  save.click();
  await frame();
  check(savedProbeEntries.length === 1, "The save button writes exactly once");
  const saved = savedProbeEntries[0] as {
    libraryId?: string;
    baseProjectRevision?: number;
  };
  check(
    saved.libraryId === library.id && saved.baseProjectRevision === 7,
    "The manually selected library and revision reach the catalog"
  );
}
