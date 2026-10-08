import {
  fitLongCharacterAliases,
  longCharacterCoreProfileFileId,
  longCharacterRelationshipsFileId,
  longCharacterFilePath,
  longChapterWorldRevealsFileId,
  longChapterContinuityFilePath,
  type DecompositionAsset,
  type DecompositionRegistry,
  type LongBookDecompositionJob,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceFileReference
} from "@deepwrite/contracts";
import { decompositionResourceId } from "./identity";
import { applyChronicle } from "./long-chronicle-assets";
import { applyWorldCategory } from "./long-world-assets";

export interface NativeAssetWriter {
  file(reference: LongWorkspaceFileReference, content: string): Promise<void>;
  object(id: string, value: unknown): void;
  /** Removes an index object the job wrote, and its document if it has one. */
  remove(id: string, file?: LongWorkspaceFileReference): Promise<void>;
}
export async function applyDecompositionNativeAsset(
  job: LongBookDecompositionJob,
  index: LongWorkspaceIndexSnapshot,
  asset: DecompositionAsset,
  registry: DecompositionRegistry,
  writer: NativeAssetWriter,
  unitId: string
): Promise<void> {
  const now = new Date().toISOString();
  const ref = (id: string, path: string) => ({ id, path, updatedAt: now });
  const chapterAt = (order: number) =>
    index.plot.chapterCards[order - job.source.range.start];
  switch (asset.kind) {
    case "book-line":
      await writer.file(
        index.bookLine,
        `${asset.content}\n\n## 核心梗与卖点\n\n${asset.gimmick}`
      );
      for (const volume of index.plot.volumes) {
        const summary = asset.volumes.find(
          ({ title }) => title === volume.title
        )?.summary;
        if (summary) {
          volume.summary = summary;
          writer.object(volume.id, volume);
        }
      }
      break;
    case "chronicle":
      await applyChronicle(job, index, asset, writer, unitId);
      break;
    case "character": {
      const entry = registry.characters.find(
        ({ id, ignored }) => id === asset.registryId && !ignored
      );
      if (!entry || entry.tier === "passerby")
        throw new Error("人物不属于本任务的必需名册。");
      const id = decompositionResourceId("character", job.id, entry.id);
      let character = index.characters.find((item) => item.id === id);
      if (!character) {
        character = {
          id,
          name: entry.name,
          // The registry keeps more aliases for matching than a character holds.
          aliases: fitLongCharacterAliases(entry.name, entry.aliases),
          group: entry.tier,
          order:
            index.characters.filter(({ group }) => group === entry.tier)
              .length + 1
        };
        index.characters.push(character);
        index.characterFiles.push({
          characterId: id,
          coreProfile: ref(
            longCharacterCoreProfileFileId(id),
            longCharacterFilePath(id, "core-profile.md")
          ),
          relationships: ref(
            longCharacterRelationshipsFileId(id),
            longCharacterFilePath(id, "relationships.md")
          )
        });
      }
      const files = index.characterFiles.find(
        ({ characterId }) => characterId === id
      )!;
      await writer.file(files.coreProfile, asset.coreProfile);
      await writer.file(files.relationships, asset.relationships);
      writer.object(id, character);
      break;
    }
    case "world":
      await applyWorldCategory(
        job,
        index,
        unitId,
        asset.categoryId,
        job.profile.worldCategories.find(({ id }) => id === asset.categoryId)
          ?.title ?? "其他",
        asset,
        writer
      );
      break;
    case "foreshadowing":
      for (const line of asset.lines) {
        const id = decompositionResourceId("foreshadow", job.id, line.key);
        const beats = line.beats.map((beat, number) => {
          const chapter = chapterAt(beat.chapterOrder);
          if (!chapter) throw new Error("伏笔触点必须挂到已读章节。");
          return {
            id: decompositionResourceId(
              "beat",
              job.id,
              `${line.key}:${number}`
            ),
            type: beat.type,
            order: number + 1,
            volumeId: chapter.volumeId,
            // The chapter decides the arc, so a rewritten chronicle that
            // moves the chapter cannot leave the beat behind.
            arcId: null,
            chapterCardId: chapter.id,
            eventId: null,
            placementId: null,
            plannedScope: "",
            note: `第 ${beat.chapterOrder} 章：${beat.note}`,
            status: "planned" as const,
            commitId: null
          };
        });
        const value = {
          id,
          title: line.title,
          coreQuestion: line.coreQuestion,
          ...(line.hiddenTruth ? { hiddenTruth: line.hiddenTruth } : {}),
          expectedReaderEffect: line.expectedReaderEffect,
          truthEventId: null,
          status: "planned" as const,
          beats
        };
        const previous = index.plot.foreshadowing.find(
          (item) => item.id === id
        );
        if (previous) Object.assign(previous, value);
        else index.plot.foreshadowing.push(value);
        writer.object(id, value);
      }
      break;
    case "continuity": {
      const latest = index.chapters.at(-1)!;
      await writer.file(latest.characterState, asset.characterState);
      await writer.file(latest.handoff, asset.handoff);
      await writer.file(
        latest.foreshadowingChanges,
        asset.foreshadowingChanges
      );
      if (asset.worldReveals) {
        latest.worldReveals ??= ref(
          longChapterWorldRevealsFileId(latest.chapterCardId),
          longChapterContinuityFilePath(
            latest.chapterCardId,
            "world-reveals.md"
          )
        );
        await writer.file(latest.worldReveals, asset.worldReveals);
      }
      break;
    }
    case "topic": {
      if (unitId === "summary:characters" && index.characterOverview) {
        await writer.file(index.characterOverview, asset.content);
      } else if (asset.domain === "world") {
        await applyWorldCategory(
          job,
          index,
          unitId,
          unitId,
          asset.title,
          { overview: asset.content, items: [] },
          writer
        );
      }
      break;
    }
  }
}
