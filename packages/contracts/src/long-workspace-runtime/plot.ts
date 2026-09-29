import { z } from "zod";
import {
  LongArcIdSchema,
  LongChapterCardIdSchema,
  LongForeshadowingBeatIdSchema,
  LongForeshadowingIdSchema,
  LongForeshadowingSpanSchema,
  LongForeshadowingStatusSchema,
  LongVolumeIdSchema
} from "../long-workspace";
import { LONG_FORESHADOWING_DIRECTORY_MAX_ENTRIES } from "../long-workspace-limits";

export const LONG_PLOT_FOCUS_SECTIONS = [
  "book_line",
  "plot_point",
  "chapter_card",
  "foreshadowing"
] as const;

export const LongForeshadowingDirectoryEntrySchema = z
  .object({
    foreshadowingId: LongForeshadowingIdSchema,
    title: z.string().trim().min(1).max(256),
    status: LongForeshadowingStatusSchema,
    plannedSpan: LongForeshadowingSpanSchema.optional(),
    beatCount: z.number().int().nonnegative().max(10_000)
  })
  .strict();

export const LongForeshadowingDirectorySnapshotSchema = z
  .object({
    totalCount: z.number().int().nonnegative().max(100_000),
    omittedCount: z.number().int().nonnegative().max(100_000),
    entries: z
      .array(LongForeshadowingDirectoryEntrySchema)
      .max(LONG_FORESHADOWING_DIRECTORY_MAX_ENTRIES)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.totalCount !== value.entries.length + value.omittedCount) {
      context.addIssue({
        code: "custom",
        path: ["omittedCount"],
        message:
          "Foreshadowing directory total must equal visible and omitted entries."
      });
    }
  });

export type LongForeshadowingDirectorySnapshot = z.infer<
  typeof LongForeshadowingDirectorySnapshotSchema
>;

export const LongPlotFocusSnapshotSchema = z
  .object({
    section: z.enum(LONG_PLOT_FOCUS_SECTIONS),
    volumeId: LongVolumeIdSchema.optional(),
    volumeTitle: z.string().trim().min(1).max(256).optional(),
    arcId: LongArcIdSchema.optional(),
    arcTitle: z.string().trim().min(1).max(256).optional(),
    chapterCardId: LongChapterCardIdSchema.optional(),
    chapterCardTitle: z.string().trim().min(1).max(256).optional(),
    foreshadowingDirectory: LongForeshadowingDirectorySnapshotSchema.optional(),
    foreshadowingThreadId: LongForeshadowingIdSchema.optional(),
    foreshadowingBeatId: LongForeshadowingBeatIdSchema.optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.volumeId) !== Boolean(value.volumeTitle)) {
      context.addIssue({
        code: "custom",
        path: ["volumeTitle"],
        message:
          "Long plot focus volume id and title must be provided together."
      });
    }
    if (Boolean(value.arcId) !== Boolean(value.arcTitle)) {
      context.addIssue({
        code: "custom",
        path: ["arcTitle"],
        message: "Long plot focus arc id and title must be provided together."
      });
    }
    if (Boolean(value.chapterCardId) !== Boolean(value.chapterCardTitle)) {
      context.addIssue({
        code: "custom",
        path: ["chapterCardTitle"],
        message:
          "Long plot focus chapter card id and title must be provided together."
      });
    }
    if (
      (value.section === "plot_point" || value.section === "chapter_card") &&
      value.volumeId === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["volumeId"],
        message: "A volume-scoped long plot focus must name its volume."
      });
    }
    if (value.section !== "plot_point" && value.arcId !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["arcId"],
        message: "Only a plot-point long plot focus may name an arc."
      });
    }
    if (value.section !== "chapter_card" && value.chapterCardId !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["chapterCardId"],
        message: "Only a chapter-card long plot focus may name a chapter card."
      });
    }
    if (
      (value.section === "book_line" || value.section === "foreshadowing") &&
      value.volumeId !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["volumeId"],
        message: "A book-scoped long plot focus must not name a volume."
      });
    }
    const isForeshadowing = value.section === "foreshadowing";
    if (isForeshadowing !== Boolean(value.foreshadowingDirectory)) {
      context.addIssue({
        code: "custom",
        path: ["foreshadowingDirectory"],
        message:
          "Only a foreshadowing focus must include its lightweight directory."
      });
    }
    if (
      !isForeshadowing &&
      (value.foreshadowingThreadId !== undefined ||
        value.foreshadowingBeatId !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["foreshadowingThreadId"],
        message: "Foreshadowing ids are only valid in a foreshadowing focus."
      });
    }
    if (value.foreshadowingBeatId && !value.foreshadowingThreadId) {
      context.addIssue({
        code: "custom",
        path: ["foreshadowingBeatId"],
        message: "A focused foreshadowing beat requires its thread id."
      });
    }
    if (
      value.foreshadowingThreadId &&
      !value.foreshadowingDirectory?.entries.some(
        (entry) => entry.foreshadowingId === value.foreshadowingThreadId
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["foreshadowingThreadId"],
        message:
          "The focused foreshadowing thread must remain in the directory."
      });
    }
  });
export type LongPlotFocusSnapshot = z.infer<typeof LongPlotFocusSnapshotSchema>;
