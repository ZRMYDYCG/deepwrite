import {
  decompositionEvidenceBudget,
  decompositionRegistryPartNames,
  type DecompositionModelCapacity,
  type DecompositionReadingCard,
  type DecompositionRegistryData,
  type LongBookDecompositionJob
} from "@deepwrite/contracts";
import { briefTokens, factLine } from "./brief-text";

type Fact = {
  chapterOrder: number;
  text: string;
  inferred?: boolean | undefined;
};
type Tier = DecompositionRegistryData["characters"][number]["tier"];

/** One name of the evidence, or one registry entry, as a registrar sees it. */
export interface RegistryItem {
  /** Number in the evidence pack (c12, t7), or the entry id at merge. */
  ref: string;
  domain: "character" | "term";
  name: string;
  aliases: string[];
  firstChapterOrder: number;
  /** Chapter cards that mention it. */
  chunkCount: number;
  mentionCount: number;
  categoryId?: string;
  tier?: Tier;
  ignored?: boolean;
  role?: string;
  facts: Fact[];
  /** Chapter cards that use each alias; ranks the aliases worth keeping. */
  aliasChunks?: Map<string, number>;
}

/**
 * Every character and term name the reading cards mention, numbered in
 * chapter order so the numbers stay the same wherever Core recomputes them.
 */
export function registryMentionItems(
  cards: readonly DecompositionReadingCard[]
): RegistryItem[] {
  const characters = new Map<string, RegistryItem>();
  const terms = new Map<string, RegistryItem>();
  const add = (
    map: Map<string, RegistryItem>,
    domain: RegistryItem["domain"],
    entry: { name: string; aliases?: string[] | undefined; facts: Fact[] },
    card: DecompositionReadingCard,
    extra: Partial<RegistryItem>
  ) => {
    const prior = map.get(entry.name);
    const aliasChunks = prior?.aliasChunks ?? new Map<string, number>();
    for (const alias of new Set(entry.aliases))
      aliasChunks.set(alias, (aliasChunks.get(alias) ?? 0) + 1);
    map.set(entry.name, {
      ref: prior?.ref ?? `${domain === "character" ? "c" : "t"}${map.size + 1}`,
      domain,
      name: entry.name,
      aliases: [
        ...new Set([...(prior?.aliases ?? []), ...(entry.aliases ?? [])])
      ],
      firstChapterOrder: Math.min(
        prior?.firstChapterOrder ?? Infinity,
        ...entry.facts.map(({ chapterOrder }) => chapterOrder),
        ...card.chapters.map(({ order }) => order)
      ),
      chunkCount: (prior?.chunkCount ?? 0) + 1,
      mentionCount: (prior?.mentionCount ?? 0) + entry.facts.length,
      facts: [...(prior?.facts ?? []), ...entry.facts],
      aliasChunks,
      ...extra,
      ...(prior?.role ? { role: prior.role } : {})
    });
  };
  const ordered = [...cards].sort(
    (a, b) => (a.chapters[0]?.order ?? 0) - (b.chapters[0]?.order ?? 0)
  );
  for (const card of ordered) {
    for (const entry of card.characters)
      add(characters, "character", entry, card, {
        ...(entry.role ? { role: entry.role } : {})
      });
    for (const entry of card.world)
      add(terms, "term", entry, card, { categoryId: entry.categoryId });
  }
  const items = [...characters.values(), ...terms.values()];
  // Most used first, so every cut of the list keeps what readers see most.
  for (const { aliases, aliasChunks } of items)
    aliases.sort(
      (a, b) => (aliasChunks?.get(b) ?? 0) - (aliasChunks?.get(a) ?? 0)
    );
  return items;
}

/** Aliases this widely shared ("师父", "小兄弟") link nothing by themselves. */
const GENERIC_SHARE = 4;

/**
 * Items sharing a name or alias stay together, so a registrar sees every
 * spelling of one object in the same part. Order follows first appearance.
 */
function linkedComponents(items: readonly RegistryItem[]): RegistryItem[][] {
  const parent = items.map((_, index) => index);
  const find = (index: number): number =>
    parent[index] === index ? index : (parent[index] = find(parent[index]!));
  const holders = new Map<string, number[]>();
  items.forEach((item, index) => {
    for (const name of new Set([item.name, ...item.aliases])) {
      const key = `${item.domain}:${name}`;
      holders.set(key, [...(holders.get(key) ?? []), index]);
    }
  });
  for (const indexes of holders.values())
    if (indexes.length > 1 && indexes.length <= GENERIC_SHARE)
      for (const index of indexes.slice(1))
        parent[find(index)] = find(indexes[0]!);
  const components = new Map<number, RegistryItem[]>();
  items.forEach((item, index) => {
    const root = find(index);
    components.set(root, [...(components.get(root) ?? []), item]);
  });
  return [...components.values()];
}

const TIER_LABELS: Record<Tier, string> = {
  protagonist: "主角",
  major_supporting: "主要配角",
  minor_supporting: "次要配角",
  passerby: "路人"
};
export const registryTierLabel = (tier: Tier | undefined) =>
  TIER_LABELS[tier ?? "passerby"];

/** One evidence line: identity first, then a sample or two of what it does. */
export function registryItemLine(item: RegistryItem): string {
  const aliases = item.aliases.slice(0, 8).join("、") || "无";
  const samples = [
    item.facts[0],
    item.chunkCount > 1 ? item.facts.at(-1) : undefined
  ]
    .filter(
      (fact, index, all): fact is Fact => !!fact && all.indexOf(fact) === index
    )
    .map((fact) => factLine(fact).slice(0, 60))
    .join("；");
  const head =
    item.domain === "character"
      ? `${item.ref}｜${item.name}｜别名：${aliases}${item.role ? `｜身份：${item.role.slice(0, 40)}` : ""}｜首次第${item.firstChapterOrder}章｜${item.chunkCount} 章提及`
      : `${item.ref}｜${item.categoryId ?? "other"}｜${item.name}｜别名：${aliases}｜首次第${item.firstChapterOrder}章｜提及 ${item.mentionCount} 次`;
  return samples ? `${head}｜${samples}` : head;
}

/**
 * Splits the names into parts a registrar decides in one call each: no part
 * holds more names than the plan budget of the model allows, nor more lines
 * than its evidence budget. Pure, so Core recomputes the same parts for the
 * evidence pack, the submission and the merge.
 */
export function planRegistryParts(
  items: readonly RegistryItem[],
  model: DecompositionModelCapacity
): RegistryItem[][] {
  const maxNames = decompositionRegistryPartNames(model);
  const maxTokens = Math.floor(decompositionEvidenceBudget(model) * 0.8);
  const parts: RegistryItem[][] = [];
  let current: RegistryItem[] = [];
  let tokens = 0;
  for (const component of linkedComponents(items))
    for (let start = 0; start < component.length; start += maxNames) {
      const piece = component.slice(start, start + maxNames);
      const size = piece.reduce(
        (sum, item) => sum + briefTokens(registryItemLine(item)) + 1,
        0
      );
      if (
        current.length &&
        (current.length + piece.length > maxNames || tokens + size > maxTokens)
      ) {
        parts.push(current);
        current = [];
        tokens = 0;
      }
      current.push(...piece);
      tokens += size;
    }
  if (current.length || !parts.length) parts.push(current);
  return parts;
}

/** Parts planned before parts were sized by budget held 1,000 names each. */
const LEGACY_PART_NAMES = 1000;
function legacyPartRefs(items: readonly RegistryItem[], unitId: string) {
  const index = Number(unitId.split(":").at(-1)) - 1;
  return items
    .slice(index * LEGACY_PART_NAMES, (index + 1) * LEGACY_PART_NAMES)
    .map(({ ref }) => ref);
}

/** The names of one `registry:part:N` unit. */
export function registryPartItems(
  job: LongBookDecompositionJob,
  items: readonly RegistryItem[],
  unitId: string
): RegistryItem[] {
  const unit = job.units[unitId];
  if (!unit) throw new Error(`名册分片不存在：${unitId}`);
  const byRef = new Map(items.map((item) => [item.ref, item]));
  return (unit.registryRefs ?? legacyPartRefs(items, unitId)).flatMap(
    (ref) => byRef.get(ref) ?? []
  );
}

/** Parts sized by budget, each unit holding the numbers of its names. */
export function addRegistryParts(
  job: LongBookDecompositionJob,
  items: readonly RegistryItem[],
  firstIndex: number,
  add: (id: string) => void
): string[] {
  return planRegistryParts(items, job.models.integration).map((part, i) => {
    const id = `registry:part:${firstIndex + i}`;
    add(id);
    job.units[id]!.registryRefs = part.map(({ ref }) => ref);
    return id;
  });
}

/**
 * Brings parts planned at a fixed 1,000 names to the budgeted plan: saved
 * parts keep the names they decided, unfinished ones are planned anew.
 */
export function replanLegacyRegistryParts(
  job: LongBookDecompositionJob,
  cards: readonly DecompositionReadingCard[],
  add: (id: string, dependencies?: string[]) => void
): boolean {
  const merge = job.units["registry:merge"];
  if (job.phase !== "registry" || !merge || merge.status === "done")
    return false;
  const parts = merge.dependencies;
  if (parts.every((id) => job.units[id]?.registryRefs)) return false;
  const items = registryMentionItems(cards);
  const kept: string[] = [];
  const decided = new Set<string>();
  for (const id of parts) {
    const unit = job.units[id];
    if (unit?.status !== "done") {
      delete job.units[id];
      continue;
    }
    unit.registryRefs ??= legacyPartRefs(items, id);
    unit.registryRefs.forEach((ref) => decided.add(ref));
    kept.push(id);
  }
  const rest = items.filter(({ ref }) => !decided.has(ref));
  const next =
    Math.max(0, ...parts.map((id) => Number(id.split(":").at(-1)))) + 1;
  const added = rest.length ? addRegistryParts(job, rest, next, add) : [];
  add("registry:merge", [...kept, ...added]);
  return true;
}
