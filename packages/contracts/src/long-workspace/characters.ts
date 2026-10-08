import { z } from "zod";

import {
  LongCharacterIdSchema,
  LongCustomCharacterTypeIdSchema,
  LongMarkdownFileReferenceSchema,
  longCharacterCoreProfileFileId,
  longCharacterRelationshipsFileId
} from "./ids";
import { LongTitleSchema } from "./primitives";

export const LONG_BUILTIN_CHARACTER_TYPE_IDS = [
  "protagonist",
  "major_supporting",
  "minor_supporting",
  "passerby"
] as const;
/** @deprecated Use LONG_BUILTIN_CHARACTER_TYPE_IDS. */
export const LONG_CHARACTER_GROUPS = LONG_BUILTIN_CHARACTER_TYPE_IDS;
export const LongCharacterTypeIdSchema = z.union([
  z.enum(LONG_BUILTIN_CHARACTER_TYPE_IDS),
  LongCustomCharacterTypeIdSchema
]);
export type LongCharacterTypeId = z.infer<typeof LongCharacterTypeIdSchema>;
/** @deprecated The serialized `group` field now stores a character type id. */
export const LongCharacterGroupSchema = LongCharacterTypeIdSchema;
export type LongCharacterGroup = z.infer<typeof LongCharacterGroupSchema>;

export const LongCharacterTypeSchema = z
  .object({
    id: LongCharacterTypeIdSchema,
    title: LongTitleSchema,
    order: z.number().int().positive()
  })
  .strict();
export type LongCharacterType = z.infer<typeof LongCharacterTypeSchema>;

export const DEFAULT_LONG_CHARACTER_TYPES: readonly LongCharacterType[] = [
  { id: "protagonist", title: "主角", order: 1 },
  { id: "major_supporting", title: "主要配角", order: 2 },
  { id: "minor_supporting", title: "次要配角", order: 3 },
  { id: "passerby", title: "路人", order: 4 }
];

export const LONG_CHARACTER_ALIAS_LIMIT = 64;
export const LONG_CHARACTER_ALIAS_MAX_LENGTH = 120;

/**
 * The aliases a long character can hold, taken in the given order: trimmed,
 * unique, never the name itself, at most the alias limit.
 */
export function fitLongCharacterAliases(
  name: string,
  aliases: readonly string[]
): string[] {
  const kept = new Set<string>();
  for (const value of aliases) {
    if (kept.size === LONG_CHARACTER_ALIAS_LIMIT) break;
    const alias = value.trim();
    if (
      alias &&
      alias !== name.trim() &&
      alias.length <= LONG_CHARACTER_ALIAS_MAX_LENGTH
    )
      kept.add(alias);
  }
  return [...kept];
}

const UniqueAliasListSchema = z
  .array(z.string().trim().min(1).max(LONG_CHARACTER_ALIAS_MAX_LENGTH))
  .max(LONG_CHARACTER_ALIAS_LIMIT)
  .superRefine((values, context) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: `Duplicate character alias: ${value}`
        });
      }
      seen.add(value);
    });
  });

export const LongCharacterSchema = z
  .object({
    id: LongCharacterIdSchema,
    name: LongTitleSchema,
    group: LongCharacterGroupSchema,
    order: z.number().int().positive(),
    aliases: UniqueAliasListSchema
  })
  .strict();
export type LongCharacter = z.infer<typeof LongCharacterSchema>;

const LongCharacterFileIndexEntryObjectSchema = z
  .object({
    characterId: LongCharacterIdSchema,
    coreProfile: LongMarkdownFileReferenceSchema,
    relationships: LongMarkdownFileReferenceSchema
  })
  .strict()
  .superRefine((entry, context) => {
    const expectedIds = [
      longCharacterCoreProfileFileId(entry.characterId),
      longCharacterRelationshipsFileId(entry.characterId)
    ];
    const files = [entry.coreProfile, entry.relationships];
    const fields = ["coreProfile", "relationships"] as const;
    files.forEach((file, index) => {
      if (file.id !== expectedIds[index]) {
        context.addIssue({
          code: "custom",
          path: [fields[index]!, "id"],
          message:
            "Character file id must match its stable character id and role."
        });
      }
    });
  });
export const LongCharacterFileIndexEntrySchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const {
    currentState: _currentState,
    history: _history,
    ...current
  } = value as Record<string, unknown>;
  return current;
}, LongCharacterFileIndexEntryObjectSchema);
export type LongCharacterFileIndexEntry = z.infer<
  typeof LongCharacterFileIndexEntrySchema
>;
