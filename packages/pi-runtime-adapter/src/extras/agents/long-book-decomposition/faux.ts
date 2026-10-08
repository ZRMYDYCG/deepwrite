import { queryAll } from "./faux-query";
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type {
  DecompositionReadingCard,
  DecompositionSubmissionData,
  ExtrasAgentResolvedTaskOf
} from "@deepwrite/contracts";
import type { ExtrasAgentRunServices } from "../../definition";
import { defineStrictTool } from "../../tools/analysis-inputs";
import { persistDecompositionSubmission } from "./submissions";

type Task = ExtrasAgentResolvedTaskOf<"long-book-decomposition">;
export function fauxDecompositionTool(
  task: Task,
  services: ExtrasAgentRunServices
): AgentTool {
  return defineStrictTool({
    name: "faux_complete_decomposition_unit",
    label: "Faux 拆解验证",
    description: "仅本地评测模式使用。",
    parameters: Type.Object({ unitId: Type.String() }),
    execute: async (_id, { unitId }) => {
      if (!services.localFaux) throw new Error("Faux 工具只能用于本地评测。");
      if (unitId.startsWith("chunk:")) {
        const source = await queryAll(services, task.input.jobId, {
          kind: "chunkText",
          chunkId: unitId
        });
        for (const chapter of source.chapters) {
          const checkpoint = `reading:${chapter.id}${source.chunk?.segment ? `:${source.chunk.segment.index}` : ""}`;
          if (task.input.units[checkpoint]?.status === "done") continue;
          const names = [
            ...new Set(
              ["主角", ...chapter.text.matchAll(/人物\d{1,2}/gu)].map(
                (value) => (typeof value === "string" ? value : value[0])
              )
            )
          ];
          const foreshadowing = [
            ...chapter.text.matchAll(/伏笔(\d+)(埋设|强化|揭示|回收)/gu)
          ].map((match) => ({
            label: `伏笔${match[1]}`,
            action: (
              {
                埋设: "plant",
                强化: "reinforce",
                揭示: "reveal",
                回收: "payoff"
              } as const
            )[match[2] as "埋设"],
            text: match[0],
            chapterOrder: chapter.order
          }));
          await persistDecompositionSubmission(task, services, checkpoint, {
            kind: "reading",
            card: {
              chunkId: unitId,
              chapters: [
                {
                  chapterId: chapter.id,
                  order: chapter.order,
                  title: chapter.title,
                  ...(source.chunk?.segment
                    ? { segmentIndex: source.chunk.segment.index }
                    : {}),
                  summary: `第 ${chapter.order} 章：${chapter.text.slice(0, 180)}（Faux 阅读记录）`,
                  events: ["主角推进当前目标。"],
                  characters: names
                }
              ],
              characters: names.map((name) => ({
                name,
                aliases: [],
                facts: [
                  { text: "推进当前目标。", chapterOrder: chapter.order }
                ],
                endState: "继续行动。"
              })),
              world: [
                {
                  categoryId: task.profile.worldCategories[0]!.id,
                  name: "世界规则",
                  aliases: [],
                  facts: [{ text: "原文规则。", chapterOrder: chapter.order }]
                }
              ],
              plot: {
                events: [
                  { text: "主角推进目标。", chapterOrder: chapter.order }
                ],
                foreshadowing
              },
              style: {
                notes: ["行动驱动，章末保留悬念。"],
                excerpts: [
                  {
                    chapterOrder: chapter.order,
                    text: chapter.text.slice(0, 100),
                    why: "开篇行动与悬念。"
                  }
                ]
              }
            }
          });
        }
        return persistDecompositionSubmission(task, services, unitId, {
          kind: "finish-card"
        });
      }
      let data: DecompositionSubmissionData;
      if (unitId.startsWith("registry:")) {
        const mentions = await queryAll(services, task.input.jobId, {
          kind: "mentions",
          unitId
        });
        // A part decides tiers by number; the merge has nothing left to decide.
        data = {
          kind: "registry-plan",
          plan: {
            groups:
              unitId === "registry:merge"
                ? []
                : (mentions.characters ?? []).map(({ ref }, i) => ({
                    refs: [ref],
                    tier: i ? "minor_supporting" : "protagonist"
                  })),
            ignored: []
          }
        };
      } else if (unitId.startsWith("review:")) {
        data = {
          kind: "review",
          review: { domain: unitId.slice(7) as "plot", issues: [] }
        };
      } else {
        const text =
          "Faux 验证：依据阅读记录整理，事实需在真实模型运行中逐章核验。";
        const status = await queryAll(services, task.input.jobId, {
          kind: "status",
          unitId
        });
        const start = status.startOrder ?? 1,
          end = status.endOrder ?? start;
        const cards =
          unitId === "plot:foreshadowing"
            ? ((await queryAll(services, task.input.jobId, {
                kind: "cards"
              })) as unknown as DecompositionReadingCard[])
            : [];
        const lines = new Map<
          string,
          Array<{
            type:
              | "plant"
              | "reinforce"
              | "reveal"
              | "payoff"
              | "misdirect"
              | "partial_reveal";
            chapterOrder: number;
            note: string;
          }>
        >();
        for (const card of cards)
          for (const fact of card.plot.foreshadowing)
            lines.set(fact.label, [
              ...(lines.get(fact.label) ?? []),
              {
                type: fact.action,
                chapterOrder: fact.chapterOrder,
                note: fact.text
              }
            ]);
        const samples =
          unitId === "style:profile"
            ? ((await queryAll(services, task.input.jobId, {
                kind: "samplePassages",
                strategy: "opening"
              })) as unknown as Array<{ chapterOrder: number; text: string }>)
            : [];
        const asset = unitId.startsWith("chronicle:")
          ? {
              kind: "chronicle" as const,
              summary: text,
              points: [
                {
                  title: "阶段目标",
                  summary: text,
                  startOrder: start,
                  endOrder: end
                }
              ]
            }
          : unitId === "plot:book-line"
            ? {
                kind: "book-line" as const,
                content: text,
                volumes: [],
                gimmick: text
              }
            : unitId === "plot:foreshadowing"
              ? {
                  kind: "foreshadowing" as const,
                  lines: [...lines].map(([title, beats], index) => ({
                    key: `fore_${index + 1}`,
                    title,
                    coreQuestion: text,
                    expectedReaderEffect: text,
                    beats
                  }))
                }
              : unitId === "plot:opening"
                ? { kind: "opening" as const, content: text }
                : unitId.startsWith("character-volume:")
                  ? {
                      kind: "character-volume" as const,
                      ...task.input.units[unitId]!.biography!,
                      content: text
                    }
                  : unitId.startsWith("character:")
                    ? {
                        kind: "character" as const,
                        registryId: unitId.slice(10),
                        summary: text,
                        coreProfile: text,
                        relationships: text,
                        latestState: text,
                        history: text
                      }
                    : unitId.startsWith("world:")
                      ? {
                          kind: "world" as const,
                          categoryId: unitId.slice(6),
                          overview: text,
                          items: [{ title: "已知设定", content: text }]
                        }
                      : unitId === "style:profile"
                        ? {
                            kind: "style" as const,
                            content: text,
                            excerpts: samples
                              .slice(0, 3)
                              .map(({ chapterOrder, text: passage }) => ({
                                chapterOrder,
                                text: passage.slice(0, 100),
                                comment: text
                              }))
                          }
                        : unitId.startsWith("topic:")
                          ? {
                              kind: "topic" as const,
                              domain: task.input.units[unitId]!.topic!.domain,
                              title: task.input.units[unitId]!.topic!.title,
                              content: text
                            }
                          : {
                              kind: "continuity" as const,
                              characterState: text,
                              handoff: text,
                              foreshadowingChanges: "暂无已发生的伏笔变化。"
                            };
        data = { kind: "asset", asset };
      }
      return persistDecompositionSubmission(task, services, unitId, data);
    }
  });
}
