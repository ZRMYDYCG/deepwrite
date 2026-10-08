import type {
  DecompositionRegistryData,
  DecompositionRegistryPlan
} from "@deepwrite/contracts";
import type { RegistryItem } from "./registry-mentions";

type Character = DecompositionRegistryData["characters"][number];
type Term = DecompositionRegistryData["terms"][number];
interface Entry {
  item: RegistryItem;
  name: string;
  aliases: string[];
  members: RegistryItem[];
  tier: Character["tier"];
  categoryId: string;
  ignored: boolean;
}

const TIER_RANK = {
  protagonist: 3,
  major_supporting: 2,
  minor_supporting: 1,
  passerby: 0
} as const;
const weight = (item: RegistryItem) => item.chunkCount + item.mentionCount;
const listed = (refs: readonly string[]) =>
  refs.slice(0, 8).join("、") +
  (refs.length > 8 ? ` 等 ${refs.length} 个` : "");

function checkRefs(
  items: ReadonlyMap<string, RegistryItem>,
  plan: DecompositionRegistryPlan
) {
  const seen = new Set<string>();
  const unknown: string[] = [];
  const repeated: string[] = [];
  for (const ref of [
    ...plan.groups.flatMap(({ refs }) => refs),
    ...plan.ignored
  ]) {
    if (!items.has(ref)) unknown.push(ref);
    else if (seen.has(ref)) repeated.push(ref);
    seen.add(ref);
  }
  if (unknown.length)
    throw new Error(
      `没有这些编号：${listed(unknown)}；只能使用本任务材料列出的编号。`
    );
  if (repeated.length)
    throw new Error(
      `编号重复出现在多个组或忽略列表：${listed(repeated)}；每个编号只能出现一次。`
    );
  const mixed = plan.groups.find(
    ({ refs }) => new Set(refs.map((ref) => items.get(ref)!.domain)).size > 1
  );
  if (mixed)
    throw new Error(`同一组不能混合人物与设定：${listed(mixed.refs)}。`);
}

function entryOf(
  members: RegistryItem[],
  group?: DecompositionRegistryPlan["groups"][number],
  ignored = false
): Entry {
  const item =
    members.find(({ name }) => name === group?.name) ??
    members.reduce((best, next) => (weight(next) > weight(best) ? next : best));
  const name = group?.name ?? item.name;
  // A member name counts its cards, an alias the cards that used it.
  const uses = new Map<string, number>();
  const use = (alias: string, count: number) =>
    uses.set(alias, (uses.get(alias) ?? 0) + count);
  for (const member of members) {
    use(member.name, member.chunkCount);
    for (const alias of member.aliases)
      use(alias, member.aliasChunks?.get(alias) ?? 0);
  }
  return {
    item,
    name,
    aliases: [...uses.keys()]
      .filter((alias) => alias !== name)
      .sort((a, b) => uses.get(b)! - uses.get(a)!),
    members,
    tier: ignored
      ? "passerby"
      : (group?.tier ??
        members
          .map(({ tier }) => tier ?? "passerby")
          .reduce((a, b) => (TIER_RANK[b] > TIER_RANK[a] ? b : a))),
    categoryId: group?.categoryId ?? item.categoryId ?? "other",
    ignored: ignored || (!group && members.every((member) => member.ignored))
  };
}

const rank = (entry: Entry) =>
  TIER_RANK[entry.tier] * 1e9 +
  entry.members.reduce((sum, member) => sum + weight(member), 0);

/**
 * Every name of one domain ends on exactly one live entry: the entry it is
 * the formal name of, else the entry owning the mention of that name, else
 * the most important one. Entries sharing a formal name are one object.
 */
function settleNames(entries: Entry[], owners: ReadonlyMap<string, string>) {
  const byName = new Map<string, Entry>();
  for (const entry of [...entries]) {
    if (entry.ignored) continue;
    const key = `${entry.item.domain}:${entry.name}`;
    const same = byName.get(key);
    if (!same) {
      byName.set(key, entry);
      continue;
    }
    same.members.push(...entry.members);
    same.aliases = [...new Set([...same.aliases, ...entry.aliases])].filter(
      (alias) => alias !== same.name
    );
    if (TIER_RANK[entry.tier] > TIER_RANK[same.tier]) same.tier = entry.tier;
    entries.splice(entries.indexOf(entry), 1);
  }
  const holders = new Map<string, Entry[]>();
  for (const entry of entries)
    if (!entry.ignored)
      for (const alias of entry.aliases) {
        const key = `${entry.item.domain}:${alias}`;
        holders.set(key, [...(holders.get(key) ?? []), entry]);
      }
  for (const [key, held] of holders) {
    const formal = byName.get(key);
    if (!formal && held.length < 2) continue;
    const owner = owners.get(key);
    const keeper =
      formal ??
      held.find(({ members }) => members.some(({ ref }) => ref === owner)) ??
      held.reduce((best, next) => (rank(next) > rank(best) ? next : best));
    const alias = key.slice(key.indexOf(":") + 1);
    for (const entry of held)
      if (entry !== keeper)
        entry.aliases = entry.aliases.filter((name) => name !== alias);
  }
}

/**
 * Builds registry entries from a registrar's plan. Groups merge their items,
 * ignored numbers become ignored entries and every other item stays a single
 * entry as it is, so the result always covers every name it was given.
 * Counts and chapters come from the items, never from the model.
 */
export function expandRegistryPlan(
  items: readonly RegistryItem[],
  plan: DecompositionRegistryPlan,
  /** `domain:name` → the item whose mention of that name is authoritative. */
  owners: ReadonlyMap<string, string> = new Map(
    items.map((item) => [`${item.domain}:${item.name}`, item.ref])
  )
): { registry: DecompositionRegistryData; entryIds: Map<string, string> } {
  const byRef = new Map(items.map((item) => [item.ref, item]));
  checkRefs(byRef, plan);
  const order = new Map(items.map((item, index) => [item.ref, index]));
  const used = new Set([
    ...plan.groups.flatMap(({ refs }) => refs),
    ...plan.ignored
  ]);
  const entries = [
    ...plan.groups.map((group) =>
      entryOf(
        group.refs.map((ref) => byRef.get(ref)!),
        group
      )
    ),
    ...plan.ignored.map((ref) => entryOf([byRef.get(ref)!], undefined, true)),
    ...items.filter(({ ref }) => !used.has(ref)).map((item) => entryOf([item]))
  ].sort(
    (a, b) =>
      Math.min(...a.members.map(({ ref }) => order.get(ref)!)) -
      Math.min(...b.members.map(({ ref }) => order.get(ref)!))
  );
  settleNames(entries, owners);
  const entryIds = new Map(
    entries.flatMap((entry) =>
      entry.members.map(({ ref }) => [ref, entry.item.ref] as const)
    )
  );
  const characters: Character[] = [];
  const terms: Term[] = [];
  for (const entry of entries) {
    const base = {
      id: entry.item.ref,
      name: entry.name,
      aliases: entry.aliases.slice(0, 100),
      ...(entry.ignored ? { ignored: true } : {})
    };
    if (entry.item.domain === "character")
      characters.push({
        ...base,
        tier: entry.tier,
        firstChapterOrder: Math.min(
          ...entry.members.map(({ firstChapterOrder }) => firstChapterOrder)
        ),
        chunkCount: entry.members.reduce(
          (sum, { chunkCount }) => sum + chunkCount,
          0
        )
      });
    else
      terms.push({
        ...base,
        categoryId: entry.categoryId,
        mentionCount: entry.members.reduce(
          (sum, { mentionCount }) => sum + mentionCount,
          0
        )
      });
  }
  return { registry: { characters, terms }, entryIds };
}
