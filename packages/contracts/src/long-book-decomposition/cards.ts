import { z } from "zod";
import { DecompositionIdSchema } from "./limits";

const order = z.number().int().min(1).max(10_000);
const fact = z.object({
  text: z.string().trim().min(1).max(2000),
  chapterOrder: order,
  inferred: z.boolean().optional()
});
export const DecompositionBeatTypeSchema = z.enum([
  "plant",
  "reinforce",
  "misdirect",
  "partial_reveal",
  "reveal",
  "payoff"
]);
export const DecompositionChapterReadingSchema = z.object({
  chapterId: DecompositionIdSchema,
  order,
  title: z.string().min(1).max(256),
  segmentIndex: z.number().int().nonnegative().optional(),
  summary: z.string().trim().min(1).max(800),
  events: z.array(z.string().min(1).max(1000)).max(8),
  characters: z.array(z.string().min(1).max(256)).max(500),
  scene: z.string().max(1000).optional(),
  hook: z.string().max(1000).optional()
});
export const DecompositionReadingCardSchema = z
  .object({
    chunkId: DecompositionIdSchema,
    chapters: z.array(DecompositionChapterReadingSchema).min(1).max(20),
    characters: z
      .array(
        z.object({
          name: z.string().min(1).max(256),
          aliases: z.array(z.string().min(1).max(256)).max(100),
          role: z.string().max(1000).optional(),
          facts: z.array(fact).max(500),
          endState: z.string().max(2000).optional()
        })
      )
      .max(500),
    world: z
      .array(
        z.object({
          categoryId: DecompositionIdSchema,
          name: z.string().min(1).max(256),
          aliases: z.array(z.string().min(1).max(256)).max(100).optional(),
          facts: z.array(fact).max(500)
        })
      )
      .max(500),
    plot: z.object({
      events: z
        .array(fact.extend({ cause: z.string().max(1000).optional() }))
        .max(160),
      foreshadowing: z
        .array(
          fact.extend({
            label: z.string().min(1).max(256),
            action: DecompositionBeatTypeSchema
          })
        )
        .max(160)
    }),
    style: z.object({
      notes: z.array(z.string().min(1).max(2000)).max(10),
      excerpts: z
        .array(
          z.object({
            chapterOrder: order,
            text: z.string().min(1).max(300),
            why: z.string().min(1).max(1000)
          })
        )
        .max(3)
    })
  })
  .superRefine((value, ctx) => {
    const orders = new Set(value.chapters.map((chapter) => chapter.order));
    const facts = [
      ...value.characters.flatMap(({ facts }) => facts),
      ...value.world.flatMap(({ facts }) => facts),
      ...value.plot.events,
      ...value.plot.foreshadowing,
      ...value.style.excerpts
    ];
    if (facts.some(({ chapterOrder }) => !orders.has(chapterOrder)))
      ctx.addIssue({ code: "custom", message: "事实必须来自提交的章节。" });
    if (JSON.stringify(value).length > 60_000)
      ctx.addIssue({ code: "custom", message: "阅读记录超过 60,000 字。" });
    if (
      new Set(value.chapters.map(({ chapterId }) => chapterId)).size !==
      value.chapters.length
    )
      ctx.addIssue({ code: "custom", message: "阅读记录章节不能重复。" });
  });
export type DecompositionReadingCard = z.infer<
  typeof DecompositionReadingCardSchema
>;
