import { z } from "zod";
import { DecompositionIdSchema } from "./limits";

export const DecompositionCharacterTierSchema = z.enum([
  "protagonist",
  "major_supporting",
  "minor_supporting",
  "passerby"
]);
export const DecompositionRegistryDataSchema = z.object({
  characters: z
    .array(
      z.object({
        id: DecompositionIdSchema,
        name: z.string().trim().min(1).max(256),
        aliases: z.array(z.string().trim().min(1).max(256)).max(100),
        tier: DecompositionCharacterTierSchema,
        firstChapterOrder: z.number().int().min(1).max(10_000),
        chunkCount: z.number().int().nonnegative(),
        ignored: z.boolean().optional()
      })
    )
    .max(5000),
  terms: z
    .array(
      z.object({
        id: DecompositionIdSchema,
        categoryId: DecompositionIdSchema,
        name: z.string().trim().min(1).max(256),
        aliases: z.array(z.string().trim().min(1).max(256)).max(100),
        mentionCount: z.number().int().nonnegative(),
        ignored: z.boolean().optional()
      })
    )
    .max(10_000)
});
export const DecompositionRegistrySchema =
  DecompositionRegistryDataSchema.extend({
    version: z.number().int().positive(),
    updatedAt: z.string().datetime(),
    editedByUser: z.boolean(),
    nameIndex: z.record(z.string(), z.string())
  });
export type DecompositionRegistryData = z.infer<
  typeof DecompositionRegistryDataSchema
>;
export type DecompositionRegistry = z.infer<typeof DecompositionRegistrySchema>;

export function normalizeDecompositionRegistry(
  data: DecompositionRegistryData,
  version: number,
  editedByUser = false
): DecompositionRegistry {
  const parsed = DecompositionRegistryDataSchema.parse(data);
  const ids = new Set<string>();
  const nameIndex: Record<string, string> = {};
  for (const item of [...parsed.characters, ...parsed.terms]) {
    if (ids.has(item.id)) throw new Error("名册标识不能重复。");
    ids.add(item.id);
    if (item.ignored) continue;
    for (const name of [item.name, ...item.aliases]) {
      const key = ("tier" in item ? "character:" : "world:") + name;
      if (nameIndex[key] && nameIndex[key] !== item.id)
        throw new Error(`名册别名重复：${name}`);
      nameIndex[key] = item.id;
    }
  }
  return DecompositionRegistrySchema.parse({
    ...parsed,
    nameIndex,
    version,
    editedByUser,
    updatedAt: new Date().toISOString()
  });
}
