import {
  decompositionReadingUnitId,
  splitDecompositionChronicles,
  normalizeDecompositionRegistry,
  readyDecompositionUnitIds,
  type LongBookDecompositionJob,
  type DecompositionRegistry,
  type DecompositionReadingCard,
  type DecompositionUnit
} from "@deepwrite/contracts";
import { decompositionSha } from "./content-guard";
import { planCharacterBiographies } from "./character-biographies";

export function addDecompositionUnit(
  job: LongBookDecompositionJob,
  id: string,
  phase: DecompositionUnit["phase"],
  dependencies: string[] = []
): void {
  const prior = job.units[id];
  if (prior) {
    if (JSON.stringify(prior.dependencies) !== JSON.stringify(dependencies)) {
      prior.dependencies = dependencies;
      prior.inputRevision = decompositionSha(
        JSON.stringify({
          previous: prior.inputRevision,
          dependencies
        })
      );
      prior.status = "pending";
      prior.attempts = 0;
    }
    if (phase === "integrate" && prior.status === "skipped") {
      prior.status = "pending";
      prior.inputRevision = decompositionSha(`${prior.inputRevision}:restored`);
    }
    return;
  }
  job.units[id] ??= {
    phase,
    status: "pending",
    attempts: 0,
    inputRevision: decompositionSha(
      JSON.stringify({
        source: job.source.fingerprint,
        output: job.outputVersion,
        id,
        profile: job.profile,
        dependencies
      })
    ),
    dependencies,
    outputRefs: [],
    receiptIds: [],
    updatedAt: new Date().toISOString()
  };
}
export function initializeDecompositionReading(job: LongBookDecompositionJob) {
  for (const chunk of job.chunks) {
    const checkpoints = chunk.chapterIds.map((id) =>
      decompositionReadingUnitId(chunk, id)
    );
    checkpoints.forEach((id) => addDecompositionUnit(job, id, "read"));
    addDecompositionUnit(job, chunk.id, "read", checkpoints);
  }
}
export function decompositionMentions(cards: DecompositionReadingCard[]) {
  const characters = new Map<
    string,
    {
      name: string;
      aliases: string[];
      firstChapterOrder: number;
      chunkCount: number;
      facts: unknown[];
    }
  >();
  const terms = new Map<
    string,
    {
      name: string;
      aliases: string[];
      categoryId: string;
      mentionCount: number;
      facts: unknown[];
    }
  >();
  for (const card of cards) {
    for (const entry of card.characters) {
      const prior = characters.get(entry.name);
      characters.set(entry.name, {
        name: entry.name,
        aliases: [...new Set([...(prior?.aliases ?? []), ...entry.aliases])],
        firstChapterOrder: Math.min(
          prior?.firstChapterOrder ?? Infinity,
          ...entry.facts.map(({ chapterOrder }) => chapterOrder),
          ...card.chapters.map(({ order }) => order)
        ),
        chunkCount: (prior?.chunkCount ?? 0) + 1,
        facts: [...(prior?.facts ?? []), ...entry.facts]
      });
    }
    for (const entry of card.world) {
      const prior = terms.get(entry.name);
      terms.set(entry.name, {
        name: entry.name,
        aliases: [
          ...new Set([...(prior?.aliases ?? []), ...(entry.aliases ?? [])])
        ],
        categoryId: entry.categoryId,
        mentionCount: (prior?.mentionCount ?? 0) + entry.facts.length,
        facts: [...(prior?.facts ?? []), ...entry.facts]
      });
    }
  }
  return { characters: [...characters.values()], terms: [...terms.values()] };
}
export function planDecompositionRegistry(
  job: LongBookDecompositionJob,
  cards: DecompositionReadingCard[]
) {
  const mentions = decompositionMentions(cards);
  const count = mentions.characters.length + mentions.terms.length;
  const parts = Array.from(
    { length: Math.max(1, Math.ceil(count / 1000)) },
    (_, i) => `registry:part:${i + 1}`
  );
  parts.forEach((id) => addDecompositionUnit(job, id, "registry"));
  addDecompositionUnit(job, "registry:merge", "registry", parts);
  job.phase = "registry";
}
export function validateDecompositionRegistryCoverage(
  registry: DecompositionRegistry,
  cards: DecompositionReadingCard[]
) {
  const mentions = decompositionMentions(cards);
  for (const [domain, entries] of [
    ["characters", mentions.characters],
    ["terms", mentions.terms]
  ] as const) {
    const names = new Set(
      registry[domain].flatMap((entry) => [entry.name, ...entry.aliases])
    );
    if (entries.some(({ name }) => !names.has(name)))
      throw new Error("名册仍有未归属的名字，请补齐或标记忽略。");
  }
}
export function planDecompositionIntegration(
  job: LongBookDecompositionJob,
  registry: DecompositionRegistry,
  cards: DecompositionReadingCard[] = []
) {
  job.chronicleSegments = splitDecompositionChronicles(
    job.chunks,
    job.models.integration
  );
  const chronicles = job.chronicleSegments.map(({ id }) => id);
  chronicles.forEach((id) => addDecompositionUnit(job, id, "integrate"));
  addDecompositionUnit(job, "plot:book-line", "integrate", chronicles);
  addDecompositionUnit(job, "plot:foreshadowing", "integrate", chronicles);
  if (job.mode === "materials")
    addDecompositionUnit(
      job,
      "plot:opening",
      "integrate",
      chronicles.slice(0, 2)
    );
  const protagonists: string[] = [];
  const biographies = planCharacterBiographies(job, registry, cards);
  const validCharacters = new Set(
    registry.characters
      .filter(({ ignored, tier }) => !ignored && tier !== "passerby")
      .map(({ id }) => id)
  );
  const validCategories = new Set(
    registry.terms
      .filter(({ ignored }) => !ignored)
      .map(({ categoryId }) => categoryId)
  );
  for (const [id, unit] of Object.entries(job.units)) {
    if (
      (id.startsWith("character:") && !validCharacters.has(id.slice(10))) ||
      (unit.biography &&
        !biographies
          .get(unit.biography.registryId)
          ?.some((biography) => biography.id === id)) ||
      (id.startsWith("world:") && !validCategories.has(id.slice(6)))
    )
      unit.status = "skipped";
  }
  for (const character of registry.characters.filter(
    ({ ignored, tier }) => !ignored && tier !== "passerby"
  )) {
    const id = `character:${character.id}`;
    const volumes = biographies.get(character.id) ?? [];
    for (const { id: volumeId, ...biography } of volumes) {
      addDecompositionUnit(job, volumeId, "integrate");
      job.units[volumeId]!.biography = biography;
    }
    addDecompositionUnit(
      job,
      id,
      "integrate",
      volumes.map(({ id }) => id)
    );
    if (character.tier !== "minor_supporting") protagonists.push(id);
  }
  for (const category of new Set(
    registry.terms
      .filter(({ ignored }) => !ignored)
      .map(({ categoryId }) => categoryId)
  ))
    addDecompositionUnit(job, `world:${category}`, "integrate");
  addDecompositionUnit(job, "style:profile", "integrate");
  if (job.mode === "continuation")
    addDecompositionUnit(job, "continuity:latest", "integrate", [
      ...protagonists,
      "plot:foreshadowing"
    ]);
  job.phase = "integrate";
}
export function planDecompositionReview(job: LongBookDecompositionJob) {
  for (const domain of [
    "character",
    "world",
    "plot",
    "style",
    ...(job.mode === "continuation" ? ["continuity"] : [])
  ])
    addDecompositionUnit(job, `review:${domain}`, "review");
  job.phase = "review";
}
export function readyDecompositionUnits(
  job: LongBookDecompositionJob
): string[] {
  return readyDecompositionUnitIds(job);
}
export const emptyDecompositionRegistry = () =>
  normalizeDecompositionRegistry({ characters: [], terms: [] }, 1);
