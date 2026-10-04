import { z } from "zod";

import {
  LongBookIdSchema,
  LongMarkdownFileReferenceSchema,
  LongWorkspaceSchemaVersionSchema
} from "./ids";
import {
  DEFAULT_LONG_CHARACTER_TYPES,
  LongCharacterFileIndexEntrySchema,
  LongCharacterSchema,
  LongCharacterTypeSchema
} from "./characters";
import {
  LongChapterFileIndexEntrySchema,
  LongLedgerCommitIndexSchema
} from "./continuity";
import { LongPlotIndexSchema } from "./plot";
import { LongTimestampSchema } from "./primitives";
import {
  DEFAULT_LONG_WORKSPACE_FEATURE_SETTINGS,
  LongWorldbuildingCategorySchema,
  LongWorkspaceFeatureSettingsSchema
} from "./worldbuilding";

export const LongWorkspaceIndexSnapshotObjectSchema = z
  .object({
    schemaVersion: LongWorkspaceSchemaVersionSchema,
    bookId: LongBookIdSchema,
    updatedAt: LongTimestampSchema,
    bookLine: LongMarkdownFileReferenceSchema,
    writeReceipts: z
      .array(LongMarkdownFileReferenceSchema)
      .max(100_000)
      .optional(),
    featureSettings: LongWorkspaceFeatureSettingsSchema.default(
      DEFAULT_LONG_WORKSPACE_FEATURE_SETTINGS
    ),
    worldbuilding: z.array(LongWorldbuildingCategorySchema).max(10_000),
    /**
     * Optional only for loading pre-overview projects. All newly-created books
     * include this file, and the project store migrates older indexes before
     * exposing them.
     */
    characterOverview: LongMarkdownFileReferenceSchema.optional(),
    characterTypes: z
      .array(LongCharacterTypeSchema)
      .max(10_000)
      .default(() =>
        DEFAULT_LONG_CHARACTER_TYPES.map((value) => ({ ...value }))
      ),
    characters: z.array(LongCharacterSchema).max(100_000),
    characterFiles: z.array(LongCharacterFileIndexEntrySchema).max(100_000),
    plot: LongPlotIndexSchema,
    chapters: z.array(LongChapterFileIndexEntrySchema).max(100_000),
    ledger: LongLedgerCommitIndexSchema
  })
  .strict();

export type LongWorkspaceIndexSnapshotInput = z.infer<
  typeof LongWorkspaceIndexSnapshotObjectSchema
>;
