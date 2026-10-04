import type {
  DecompositionReadingCard,
  DecompositionRegistry,
  LongBookDecompositionJob
} from "@deepwrite/contracts";

export function planCharacterBiographies(
  job: LongBookDecompositionJob,
  registry: DecompositionRegistry,
  cards: DecompositionReadingCard[]
) {
  const result = new Map<
    string,
    Array<{
      id: string;
      registryId: string;
      volume: string;
      startOrder: number;
      endOrder: number;
    }>
  >();
  const volumes = new Map<
    string,
    { start: number; end: number; chunkIds: Set<string> }
  >();
  for (const chunk of job.chunks) {
    const title = chunk.volume ?? "第一卷";
    const prior = volumes.get(title);
    volumes.set(title, {
      start: Math.min(prior?.start ?? Infinity, chunk.startOrder),
      end: Math.max(prior?.end ?? 0, chunk.endOrder),
      chunkIds: new Set([...(prior?.chunkIds ?? []), chunk.id])
    });
  }
  for (const character of registry.characters.filter(
    ({ ignored, tier }) =>
      !ignored && ["protagonist", "major_supporting"].includes(tier)
  )) {
    const names = new Set([character.name, ...character.aliases]);
    const appeared = [...volumes].filter(([, volume]) =>
      cards.some(
        (card) =>
          volume.chunkIds.has(card.chunkId) &&
          card.characters.some(({ name }) => names.has(name))
      )
    );
    if (appeared.length <= 1) continue;
    const units = appeared.map(([volume, { start, end }], index) => {
      const id = `character-volume:${character.id}:${index + 1}`;
      return {
        id,
        registryId: character.id,
        volume,
        startOrder: start,
        endOrder: end
      };
    });
    result.set(character.id, units);
  }
  return result;
}
