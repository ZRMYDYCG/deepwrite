import { z } from "zod";
import { DecompositionIdSchema } from "./limits";

export const LongBookDecompositionProfileSchema = z
  .object({
    id: DecompositionIdSchema,
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(500),
    builtin: z.boolean().optional(),
    systemPrompt: z.string().trim().max(20_000),
    worldCategories: z
      .array(
        z.object({
          id: DecompositionIdSchema,
          title: z.string().trim().min(1).max(80),
          hint: z.string().max(1000).optional()
        })
      )
      .min(1)
      .max(20)
  })
  .refine(
    (value) =>
      new Set(value.worldCategories.map(({ id }) => id)).size ===
      value.worldCategories.length,
    "世界观类别标识不能重复。"
  );
export type LongBookDecompositionProfile = z.infer<
  typeof LongBookDecompositionProfileSchema
>;

export const DEFAULT_DECOMPOSITION_PROFILE: LongBookDecompositionProfile = {
  id: "decomposition-general",
  name: "通用",
  description: "重建全书的人物、剧情、世界观与文风。",
  builtin: true,
  systemPrompt: "",
  worldCategories: [
    { id: "rules", title: "规则" },
    { id: "factions", title: "势力" },
    { id: "geography", title: "地理" },
    { id: "history", title: "历史" },
    { id: "terminology", title: "术语" },
    { id: "realms", title: "境界" },
    { id: "items", title: "物品" }
  ]
};
