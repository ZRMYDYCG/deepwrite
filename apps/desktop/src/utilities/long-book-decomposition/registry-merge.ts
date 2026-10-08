import {
  decompositionBatchLimit,
  decompositionEvidenceBudget,
  type DecompositionReadingCard,
  type DecompositionRecord,
  type DecompositionRegistryData,
  type LongBookDecompositionJob
} from "@deepwrite/contracts";
import { briefTokens } from "./brief-text";
import {
  registryMentionItems,
  registryPartItems,
  registryTierLabel,
  type RegistryItem
} from "./registry-mentions";
import { expandRegistryPlan } from "./registry-plan";

type Entry =
  | DecompositionRegistryData["characters"][number]
  | DecompositionRegistryData["terms"][number];
/** Merge base: entries of the saved parts after the merge Core can decide. */
export interface RegistryMergeInput {
  items: RegistryItem[];
  owners: Map<string, string>;
  registry: DecompositionRegistryData;
  /** Entry ids from different parts that may name one object. */
  candidates: string[][];
}

const MAX_CLUSTER = 8;
/** Names this widely shared say nothing about identity. */
const GENERIC_SHARE = 4;

function partItems(
  registry: DecompositionRegistryData,
  part: number,
  taken: Set<string>
): Array<RegistryItem & { part: number }> {
  return [...registry.characters, ...registry.terms].map((entry: Entry) => {
    let ref = entry.id;
    for (let n = 2; taken.has(ref); n++) ref = `${entry.id}_${n}`;
    taken.add(ref);
    const character = "tier" in entry;
    return {
      ref,
      part,
      domain: character ? "character" : "term",
      name: entry.name,
      aliases: entry.aliases,
      firstChapterOrder: character ? entry.firstChapterOrder : 1,
      chunkCount: character ? entry.chunkCount : 0,
      mentionCount: character ? 0 : entry.mentionCount,
      ...(character ? { tier: entry.tier } : { categoryId: entry.categoryId }),
      ...(entry.ignored ? { ignored: true } : {}),
      facts: []
    };
  });
}

/** Pairs of live entries from different parts that may be one object. */
function candidatePairs(
  items: ReadonlyArray<RegistryItem & { part: number }>,
  entryIds: ReadonlyMap<string, string>
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const live = items.filter(({ ignored }) => !ignored);
  const holders = new Map<string, typeof live>();
  for (const item of live)
    for (const name of new Set([item.name, ...item.aliases])) {
      const key = `${item.domain}:${name}`;
      holders.set(key, [...(holders.get(key) ?? []), item]);
    }
  for (const held of holders.values())
    if (held.length > 1 && held.length <= GENERIC_SHARE)
      for (const other of held.slice(1))
        if (other.part !== held[0]!.part) pairs.push([held[0]!.ref, other.ref]);
  // A formal name inside another one ("老三" in "张老三") across parts.
  const byPair = new Map<string, typeof live>();
  for (const item of live)
    for (let i = 0; i + 2 <= item.name.length; i++) {
      const key = `${item.domain}:${item.name.slice(i, i + 2)}`;
      byPair.set(key, [...(byPair.get(key) ?? []), item]);
    }
  const minor = (item: RegistryItem) =>
    item.domain === "character" && (item.tier ?? "passerby") === "passerby";
  for (const item of live) {
    if (item.name.length < 2) continue;
    for (const other of byPair.get(`${item.domain}:${item.name.slice(0, 2)}`) ??
      [])
      if (
        other.part !== item.part &&
        other.name !== item.name &&
        other.name.includes(item.name) &&
        !(minor(item) && minor(other))
      )
        pairs.push([item.ref, other.ref]);
  }
  return pairs
    .map(([a, b]) => [entryIds.get(a)!, entryIds.get(b)!] as [string, string])
    .filter(([a, b]) => a !== b);
}

function clusters(
  pairs: ReadonlyArray<[string, string]>,
  weight: (id: string) => number
): string[][] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const up = parent.get(id) ?? id;
    if (up === id) return id;
    const root = find(up);
    parent.set(id, root);
    return root;
  };
  for (const [a, b] of pairs) parent.set(find(a), find(b));
  const groups = new Map<string, Set<string>>();
  for (const id of new Set(pairs.flat()))
    groups.set(find(id), (groups.get(find(id)) ?? new Set()).add(id));
  return [...groups.values()]
    .map((ids) =>
      [...ids].sort((a, b) => weight(b) - weight(a)).slice(0, MAX_CLUSTER)
    )
    .sort((a, b) => weight(b[0]!) - weight(a[0]!));
}

/**
 * Merges the saved parts as far as Core can decide: identical formal names
 * become one entry and every name ends on one entry. What only a reader
 * can decide — spellings of one object split across parts — is left as
 * candidate clusters, as many as one call of the model can settle.
 */
export async function registryMergeInput(
  job: LongBookDecompositionJob,
  record: (unitId: string) => Promise<DecompositionRecord>,
  cards: readonly DecompositionReadingCard[]
): Promise<RegistryMergeInput> {
  const taken = new Set<string>();
  const items: Array<RegistryItem & { part: number }> = [];
  const parts = job.units["registry:merge"]!.dependencies;
  for (const [part, id] of parts.entries()) {
    const saved = await record(id);
    if (saved.data.kind === "registry")
      items.push(...partItems(saved.data.registry, part, taken));
  }
  // Each mention belongs to the part that listed it; that part's entry owns it.
  const owners = new Map<string, string>();
  const named = new Map<string, string>();
  for (const item of items)
    for (const name of [item.name, ...item.aliases])
      if (
        !named.has(`${item.part}|${item.domain}:${name}`) ||
        name === item.name
      )
        named.set(`${item.part}|${item.domain}:${name}`, item.ref);
  const mentions = registryMentionItems(cards);
  parts.forEach((id, part) => {
    for (const mention of registryPartItems(job, mentions, id)) {
      const key = `${mention.domain}:${mention.name}`;
      const owner = named.get(`${part}|${key}`);
      if (owner) owners.set(key, owner);
    }
  });
  // A name no part covered still gets an entry of its own.
  for (const mention of mentions)
    if (!owners.has(`${mention.domain}:${mention.name}`)) {
      const ref = taken.has(mention.ref) ? `${mention.ref}_merge` : mention.ref;
      taken.add(ref);
      items.push({ ...mention, ref, facts: [], part: parts.length });
      owners.set(`${mention.domain}:${mention.name}`, ref);
    }
  const merged = expandRegistryPlan(items, { groups: [], ignored: [] }, owners);
  const entries = new Map(
    [...merged.registry.characters, ...merged.registry.terms].map(
      (entry: Entry) => [entry.id, entry]
    )
  );
  const weight = (id: string) => {
    const entry = entries.get(id)!;
    return "tier" in entry
      ? [
          "passerby",
          "minor_supporting",
          "major_supporting",
          "protagonist"
        ].indexOf(entry.tier) *
          1e6 +
          entry.chunkCount
      : entry.mentionCount;
  };
  const found =
    parts.length > 1
      ? clusters(candidatePairs(items, merged.entryIds), weight)
      : [];
  // One call settles the clusters; the evidence budget bounds their lines.
  const lineBudget = decompositionEvidenceBudget(job.models.integration) * 0.8;
  const candidates: string[][] = [];
  let used = 0;
  for (const cluster of found.slice(
    0,
    decompositionBatchLimit(job.models.integration, "registryCluster")
  )) {
    used += cluster.reduce(
      (sum, id) => sum + briefTokens(registryEntryLine(entries.get(id)!)),
      0
    );
    if (used > lineBudget) break;
    candidates.push(cluster);
  }
  return {
    items: [...entries.values()].map((entry) => ({
      ref: entry.id,
      domain: "tier" in entry ? "character" : "term",
      name: entry.name,
      aliases: entry.aliases,
      firstChapterOrder: "tier" in entry ? entry.firstChapterOrder : 1,
      chunkCount: "tier" in entry ? entry.chunkCount : 0,
      mentionCount: "tier" in entry ? 0 : entry.mentionCount,
      ...("tier" in entry
        ? { tier: entry.tier }
        : { categoryId: entry.categoryId }),
      ...(entry.ignored ? { ignored: true } : {}),
      facts: []
    })),
    owners: new Map(
      [...owners].map(([key, ref]) => [key, merged.entryIds.get(ref) ?? ref])
    ),
    registry: merged.registry,
    candidates
  };
}

/** One merge evidence line: an entry as the parts left it. */
export function registryEntryLine(entry: Entry): string {
  const aliases = entry.aliases.slice(0, 8).join("、") || "无";
  return "tier" in entry
    ? `${entry.id}｜人物｜${entry.name}｜${registryTierLabel(entry.tier)}｜别名：${aliases}｜首次第${entry.firstChapterOrder}章｜${entry.chunkCount} 章提及`
    : `${entry.id}｜设定｜${entry.categoryId}｜${entry.name}｜别名：${aliases}｜提及 ${entry.mentionCount} 次`;
}
