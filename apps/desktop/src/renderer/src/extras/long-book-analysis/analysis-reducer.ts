import {
  localizedMessage,
  type LocalizedText
} from "../analysis-ui/localized-text";
import { createScopedTranslator } from "../../i18n";
import type {
  LongBookAnalysisNote,
  LongBookAnalysisResult
} from "@deepwrite/contracts/renderer";
import {
  estimateAnalysisTokens,
  groupAnalysisNotes,
  splitAnalysisNotesForBudget
} from "./batching";
import { createAnalysisNote } from "./analysis-pipeline-helpers";
import type { LongBookAnalysisJob } from "./analysis-pipeline-types";

const t = createScopedTranslator("extras.longBookAnalysis");

interface AnalysisReducerDependencies {
  run(notes: LongBookAnalysisNote[]): Promise<string | LongBookAnalysisResult>;
  begin(detail: LocalizedText): void;
  addEstimatedUnits(count: number): void;
  completeUnit(): void;
}

export async function reduceAnalysisJob(
  job: LongBookAnalysisJob,
  dependencies: AnalysisReducerDependencies
): Promise<void> {
  while (
    job.notes.length > 1 ||
    job.notes.some(
      (note) => estimateAnalysisTokens(note.text) > job.inputBudget * 0.9
    )
  ) {
    if (!job.reduction) {
      const inputs = splitAnalysisNotesForBudget(job.notes, job.inputBudget);
      const groups = groupAnalysisNotes(inputs, job.inputBudget);
      if (groups.every((group) => group.length === 1)) {
        throw new Error(t("noteExceedsBudget"));
      }
      job.reductionRounds += 1;
      if (job.reductionRounds > 8) {
        throw new Error(t("mergedNotesExceedBudget"));
      }
      job.reduction = { groups, groupIndex: 0, output: [] };
      dependencies.addEstimatedUnits(
        groups.filter((group) => group.length > 1).length
      );
    }
    const reduction = job.reduction;
    while (reduction.groupIndex < reduction.groups.length) {
      const group = reduction.groups[reduction.groupIndex]!;
      if (group.length === 1) reduction.output.push(group[0]!);
      else {
        const start = Math.min(...group.map((note) => note.chapterStart));
        const end = Math.max(...group.map((note) => note.chapterEnd));
        dependencies.begin(
          localizedMessage("extras.longBookAnalysis.mergingChapterNotes", {
            start: start,
            end: end,
            count: group.length
          })
        );
        const merged = await dependencies.run(group);
        if (typeof merged !== "string") {
          throw new Error(t("mergeNoteMissing"));
        }
        reduction.output.push(
          createAnalysisNote(
            merged,
            t("mergedNoteTitle", {
              start: start,
              end: end
            }),
            start,
            end
          )
        );
        dependencies.completeUnit();
      }
      reduction.groupIndex += 1;
    }
    job.notes = reduction.output;
    delete job.reduction;
  }
}
