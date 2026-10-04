import {
  decompositionAssetProse,
  type DecompositionRecord,
  type LongBookDecompositionProfile
} from "@deepwrite/contracts/renderer";
import { createScopedTranslator } from "../../i18n";
const t = createScopedTranslator("extras.longBookDecomposition");

type Data = DecompositionRecord["data"];
const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
const section = (title: string, body: string) =>
  body ? `### ${title}\n\n${body}` : "";

function reading(data: Extract<Data, { kind: "reading" }>): string {
  const { card } = data;
  const chapters = card.chapters.map((chapter) =>
    [
      `## ${chapter.title}${
        chapter.segmentIndex === undefined
          ? ""
          : ` · ${t("recordPart", { index: chapter.segmentIndex + 1 })}`
      }`,
      chapter.summary,
      section(t("recordEvents"), list(chapter.events)),
      chapter.characters.length
        ? `**${t("recordCast")}**：${chapter.characters.join("、")}`
        : "",
      chapter.scene ? `**${t("recordScene")}**：${chapter.scene}` : "",
      chapter.hook ? `**${t("recordHook")}**：${chapter.hook}` : ""
    ]
      .filter(Boolean)
      .join("\n\n")
  );
  const fact = ({
    text,
    chapterOrder
  }: {
    text: string;
    chapterOrder: number;
  }) => `${t("recordChapter", { order: chapterOrder })}：${text}`;
  return [
    ...chapters,
    section(
      t("recordCharacters"),
      list(
        card.characters.map(
          ({ name, aliases, role, facts }) =>
            `**${name}**${aliases.length ? `（${aliases.join("、")}）` : ""}${
              role ? `：${role}` : ""
            }${facts.length ? `\n${facts.map((item) => `  - ${fact(item)}`).join("\n")}` : ""}`
        )
      )
    ),
    section(
      t("recordWorld"),
      list(
        card.world.map(
          ({ name, facts }) =>
            `**${name}**${facts.length ? `\n${facts.map((item) => `  - ${fact(item)}`).join("\n")}` : ""}`
        )
      )
    ),
    section(t("recordPlot"), list(card.plot.events.map(fact))),
    section(
      t("recordForeshadowing"),
      list(
        card.plot.foreshadowing.map(
          (item) => `**${item.label}** · ${item.action}：${fact(item)}`
        )
      )
    ),
    section(t("recordStyle"), list(card.style.notes)),
    section(
      t("recordExcerpts"),
      card.style.excerpts
        .map(
          ({ chapterOrder, text, why }) =>
            `> ${text}\n\n${t("recordChapter", { order: chapterOrder })}：${why}`
        )
        .join("\n\n")
    )
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Readable Markdown for one unit's task-local records. */
export function decompositionRecordMarkdown(
  records: readonly DecompositionRecord[],
  profile: LongBookDecompositionProfile
): string {
  return records
    .map(({ data }) => {
      if (data.kind === "reading") return reading(data);
      if (data.kind === "registry")
        return [
          section(
            t("characters"),
            list(
              data.registry.characters
                .filter(({ ignored }) => !ignored)
                .map(
                  ({ name, aliases, tier, firstChapterOrder }) =>
                    `**${name}**${aliases.length ? `（${aliases.join("、")}）` : ""} · ${t(tier)} · ${t("recordChapter", { order: firstChapterOrder })}`
                )
            )
          ),
          section(
            t("terms"),
            list(
              data.registry.terms
                .filter(({ ignored }) => !ignored)
                .map(
                  ({ name, aliases, categoryId }) =>
                    `**${name}**${aliases.length ? `（${aliases.join("、")}）` : ""} · ${
                      profile.worldCategories.find(
                        ({ id }) => id === categoryId
                      )?.title ?? categoryId
                    }`
                )
            )
          )
        ]
          .filter(Boolean)
          .join("\n\n");
      if (data.kind === "review")
        return data.review.issues.length
          ? list(
              data.review.issues.map(
                ({ description, suggestion, resolution }) =>
                  `${description}（${t(`resolution_${resolution}`)}）\n\n  ${t("recordSuggestion")}：${suggestion}`
              )
            )
          : t("recordNoIssues");
      if (data.kind === "asset") return decompositionAssetProse(data.asset);
      return "";
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
}
