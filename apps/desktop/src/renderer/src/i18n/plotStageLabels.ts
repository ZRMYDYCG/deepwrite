import { createDefaultCreativePlotStages } from "@deepwrite/contracts/renderer";
import type { CreativePlotStage } from "@deepwrite/contracts";
import { t } from "./index";
import type { TranslationKey } from "./messages";

const defaultTitles = new Map(
  createDefaultCreativePlotStages().map(({ id, title }) => [id, title])
);
const labelKeys: Readonly<Record<string, TranslationKey>> = {
  worldbuilding: "components.catalogLabels.plotWorldbuilding",
  plot_design: "components.catalogLabels.plotDesign",
  intro_design: "components.catalogLabels.plotIntroduction",
  plot_refine: "components.catalogLabels.plotRefinement",
  narrative_perspective: "components.catalogLabels.plotNarrativePerspective",
  outline: "components.catalogLabels.plotOutline"
};

/** Translate built-in presentation only; saved and user-edited titles stay intact. */
export function plotStageLabel(
  stage: Pick<CreativePlotStage, "id" | "title">
): string {
  const key = labelKeys[stage.id];
  return key && stage.title === defaultTitles.get(stage.id)
    ? t(key)
    : stage.title;
}
