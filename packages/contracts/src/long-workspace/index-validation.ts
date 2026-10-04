import { z } from "zod";

import {
  LONG_BOOK_LINE_FILE_ID,
  LONG_CHARACTER_OVERVIEW_FILE_ID,
  LONG_CHARACTER_OVERVIEW_PATH,
  type LongWorkspaceFileReference
} from "./ids";
import {
  deriveLongForeshadowingStatusFromCommittedBeats,
  type LongForeshadowingBeat
} from "./plot";
import type { LongContinuityDomain } from "./continuity";
import {
  LongWorkspaceIndexSnapshotObjectSchema,
  type LongWorkspaceIndexSnapshotInput
} from "./index-schema";
import {
  addIssue,
  groupOrderedEntries,
  hasBeforeCycle,
  validateContiguousOrder,
  validateUniqueValues,
  type ValidationPath
} from "./index-validation-helpers";
import { indexLedgerCommitMemberships } from "./index-ledger-membership";
import {
  longLedgerCommitChapterIds,
  longLedgerCommitCheckpointChapterId
} from "./ledger-index-entry";

function validateLongWorkspaceIndexSnapshot(
  snapshot: LongWorkspaceIndexSnapshotInput,
  context: z.core.$RefinementCtx<unknown>
): void {
  if (snapshot.bookLine.id !== LONG_BOOK_LINE_FILE_ID) {
    addIssue(
      context,
      ["bookLine", "id"],
      `Book-line file id must be ${LONG_BOOK_LINE_FILE_ID}.`
    );
  }
  if (
    snapshot.characterOverview &&
    snapshot.characterOverview.id !== LONG_CHARACTER_OVERVIEW_FILE_ID
  ) {
    addIssue(
      context,
      ["characterOverview", "id"],
      `Character overview file id must be ${LONG_CHARACTER_OVERVIEW_FILE_ID}.`
    );
  }
  if (
    snapshot.characterOverview &&
    snapshot.characterOverview.path !== LONG_CHARACTER_OVERVIEW_PATH
  ) {
    addIssue(
      context,
      ["characterOverview", "path"],
      `Character overview file path must be ${LONG_CHARACTER_OVERVIEW_PATH}.`
    );
  }

  validateUniqueValues(
    snapshot.worldbuilding.map(({ id }) => id),
    (index) => ["worldbuilding", index, "id"],
    "worldbuilding category id",
    context
  );
  validateContiguousOrder(
    snapshot.worldbuilding.map(({ order }, index) => ({ index, order })),
    (index) => ["worldbuilding", index, "order"],
    "Worldbuilding category",
    context
  );
  const worldbuildingIds = new Set(snapshot.worldbuilding.map(({ id }) => id));
  validateUniqueValues(
    snapshot.worldbuilding.flatMap((category) =>
      category.format === "list" ? category.items.map(({ id }) => id) : []
    ),
    (index) => ["worldbuilding", index, "items"],
    "worldbuilding item id",
    context
  );
  snapshot.worldbuilding.forEach((category, categoryIndex) => {
    if (category.format !== "list") return;
    validateContiguousOrder(
      category.items.map(({ order }, index) => ({ index, order })),
      (index) => ["worldbuilding", categoryIndex, "items", index, "order"],
      "Worldbuilding item",
      context
    );
  });

  validateUniqueValues(
    snapshot.characterTypes.map(({ id }) => id),
    (index) => ["characterTypes", index, "id"],
    "character type id",
    context
  );
  validateContiguousOrder(
    snapshot.characterTypes.map(({ order }, index) => ({ index, order })),
    (index) => ["characterTypes", index, "order"],
    "Character type",
    context
  );
  const characterTypeIds = new Set(snapshot.characterTypes.map(({ id }) => id));
  snapshot.characters.forEach((character, index) => {
    if (!characterTypeIds.has(character.group)) {
      addIssue(
        context,
        ["characters", index, "group"],
        "Character group must reference an existing character type."
      );
    }
  });

  validateUniqueValues(
    snapshot.characters.map(({ id }) => id),
    (index) => ["characters", index, "id"],
    "character id",
    context
  );
  for (const [group, entries] of groupOrderedEntries(
    snapshot.characters,
    ({ group }) => group,
    ({ order }) => order
  )) {
    validateContiguousOrder(
      entries,
      (index) => ["characters", index, "order"],
      `Character group ${group}`,
      context
    );
  }

  const characterIds = new Set(snapshot.characters.map(({ id }) => id));
  validateUniqueValues(
    snapshot.characterFiles.map(({ characterId }) => characterId),
    (index) => ["characterFiles", index, "characterId"],
    "character file index",
    context
  );
  snapshot.characterFiles.forEach((entry, index) => {
    if (!characterIds.has(entry.characterId)) {
      addIssue(
        context,
        ["characterFiles", index, "characterId"],
        "Character file index must reference an existing character."
      );
    }
  });
  const characterFileIds = new Set(
    snapshot.characterFiles.map(({ characterId }) => characterId)
  );
  for (const characterId of characterIds) {
    if (!characterFileIds.has(characterId)) {
      addIssue(
        context,
        ["characterFiles"],
        `Missing file index for character ${characterId}.`
      );
    }
  }

  const {
    volumes,
    arcs,
    chapterCards,
    storyEvents,
    storyPlots,
    eventConnections,
    narrativePlacements,
    foreshadowing
  } = snapshot.plot;

  validateUniqueValues(
    volumes.map(({ id }) => id),
    (index) => ["plot", "volumes", index, "id"],
    "volume id",
    context
  );
  validateContiguousOrder(
    volumes.map(({ order }, index) => ({ index, order })),
    (index) => ["plot", "volumes", index, "order"],
    "Volume",
    context
  );
  const volumeById = new Map(volumes.map((volume) => [volume.id, volume]));

  validateUniqueValues(
    arcs.map(({ id }) => id),
    (index) => ["plot", "arcs", index, "id"],
    "arc id",
    context
  );
  arcs.forEach((arc, index) => {
    if (!volumeById.has(arc.volumeId)) {
      addIssue(
        context,
        ["plot", "arcs", index, "volumeId"],
        "Arc must reference an existing volume."
      );
    }
  });
  for (const [volumeId, entries] of groupOrderedEntries(
    arcs,
    ({ volumeId }) => volumeId,
    ({ order }) => order
  )) {
    validateContiguousOrder(
      entries,
      (index) => ["plot", "arcs", index, "order"],
      `Arc group ${volumeId}`,
      context
    );
  }
  const arcById = new Map(arcs.map((arc) => [arc.id, arc]));

  validateUniqueValues(
    chapterCards.map(({ id }) => id),
    (index) => ["plot", "chapterCards", index, "id"],
    "chapter-card id",
    context
  );
  chapterCards.forEach((card, index) => {
    const volume = volumeById.get(card.volumeId);
    const arc =
      card.primaryArcId === null ? undefined : arcById.get(card.primaryArcId);
    if (!volume) {
      addIssue(
        context,
        ["plot", "chapterCards", index, "volumeId"],
        "Chapter card must reference an existing volume."
      );
    }
    if (card.primaryArcId !== null && !arc) {
      addIssue(
        context,
        ["plot", "chapterCards", index, "primaryArcId"],
        "Chapter card must reference an existing primary arc."
      );
    } else if (arc && arc.volumeId !== card.volumeId) {
      addIssue(
        context,
        ["plot", "chapterCards", index, "primaryArcId"],
        "Chapter card and primary arc must belong to the same volume."
      );
    }
  });
  for (const [volumeId, entries] of groupOrderedEntries(
    chapterCards,
    ({ volumeId }) => volumeId,
    ({ narrativeOrder }) => narrativeOrder
  )) {
    validateContiguousOrder(
      entries,
      (index) => ["plot", "chapterCards", index, "narrativeOrder"],
      `Chapter narrative order in ${volumeId}`,
      context
    );
  }
  const chapterById = new Map(
    chapterCards.map((chapter) => [chapter.id, chapter])
  );

  validateUniqueValues(
    storyPlots.map(({ id }) => id),
    (index) => ["plot", "storyPlots", index, "id"],
    "story-plot id",
    context
  );
  storyPlots.forEach((storyPlot, index) => {
    if (!arcById.has(storyPlot.arcId)) {
      addIssue(
        context,
        ["plot", "storyPlots", index, "arcId"],
        "Story plot must reference an existing arc."
      );
    }
  });
  for (const [arcId, entries] of groupOrderedEntries(
    storyPlots,
    ({ arcId }) => arcId,
    ({ order }) => order
  )) {
    validateContiguousOrder(
      entries,
      (index) => ["plot", "storyPlots", index, "order"],
      `Story-plot group ${arcId}`,
      context
    );
  }

  validateUniqueValues(
    storyEvents.map(({ id }) => id),
    (index) => ["plot", "storyEvents", index, "id"],
    "story-event id",
    context
  );
  validateContiguousOrder(
    storyEvents.map(({ storyOrder }, index) => ({
      index,
      order: storyOrder
    })),
    (index) => ["plot", "storyEvents", index, "storyOrder"],
    "Story event",
    context
  );
  const eventById = new Map(storyEvents.map((event) => [event.id, event]));
  storyEvents.forEach((event, index) => {
    event.arcIds.forEach((arcId, arcIndex) => {
      if (!arcById.has(arcId)) {
        addIssue(
          context,
          ["plot", "storyEvents", index, "arcIds", arcIndex],
          "Story event must reference an existing arc."
        );
      }
    });
    event.characterIds.forEach((characterId, characterIndex) => {
      if (!characterIds.has(characterId)) {
        addIssue(
          context,
          ["plot", "storyEvents", index, "characterIds", characterIndex],
          "Story event must reference an existing character."
        );
      }
    });
  });

  validateUniqueValues(
    eventConnections.map(({ id }) => id),
    (index) => ["plot", "eventConnections", index, "id"],
    "event-connection id",
    context
  );
  validateUniqueValues(
    eventConnections.map(
      ({ sourceEventId, targetEventId, type }) =>
        `${sourceEventId}\0${targetEventId}\0${type}`
    ),
    (index) => ["plot", "eventConnections", index],
    "event connection",
    context
  );
  eventConnections.forEach((connection, index) => {
    if (!eventById.has(connection.sourceEventId)) {
      addIssue(
        context,
        ["plot", "eventConnections", index, "sourceEventId"],
        "Event connection source must reference an existing event."
      );
    }
    if (!eventById.has(connection.targetEventId)) {
      addIssue(
        context,
        ["plot", "eventConnections", index, "targetEventId"],
        "Event connection target must reference an existing event."
      );
    }
  });
  if (
    hasBeforeCycle(
      storyEvents.map(({ id }) => id),
      eventConnections
    )
  ) {
    addIssue(
      context,
      ["plot", "eventConnections"],
      "Before-event connections cannot form a cycle."
    );
  }

  validateUniqueValues(
    narrativePlacements.map(({ id }) => id),
    (index) => ["plot", "narrativePlacements", index, "id"],
    "narrative-placement id",
    context
  );
  narrativePlacements.forEach((placement, index) => {
    if (!eventById.has(placement.eventId)) {
      addIssue(
        context,
        ["plot", "narrativePlacements", index, "eventId"],
        "Narrative placement must reference an existing event."
      );
    }
    if (!chapterById.has(placement.chapterCardId)) {
      addIssue(
        context,
        ["plot", "narrativePlacements", index, "chapterCardId"],
        "Narrative placement must reference an existing chapter card."
      );
    }
  });
  for (const [chapterCardId, entries] of groupOrderedEntries(
    narrativePlacements,
    ({ chapterCardId }) => chapterCardId,
    ({ orderInChapter }) => orderInChapter
  )) {
    validateContiguousOrder(
      entries,
      (index) => ["plot", "narrativePlacements", index, "orderInChapter"],
      `Narrative placement order in ${chapterCardId}`,
      context
    );
  }
  const placementById = new Map(
    narrativePlacements.map((placement) => [placement.id, placement])
  );

  validateUniqueValues(
    foreshadowing.map(({ id }) => id),
    (index) => ["plot", "foreshadowing", index, "id"],
    "foreshadowing id",
    context
  );
  const beatById = new Map<
    string,
    { beat: LongForeshadowingBeat; threadIndex: number; beatIndex: number }
  >();
  foreshadowing.forEach((thread, threadIndex) => {
    if (thread.status !== "abandoned") {
      const derivedStatus = deriveLongForeshadowingStatusFromCommittedBeats(
        thread.beats
      );
      if (thread.status !== derivedStatus) {
        addIssue(
          context,
          ["plot", "foreshadowing", threadIndex, "status"],
          `Foreshadowing status must be ${derivedStatus}, derived from its committed beats, unless it is explicitly abandoned.`
        );
      }
    }
    if (thread.truthEventId !== null && !eventById.has(thread.truthEventId)) {
      addIssue(
        context,
        ["plot", "foreshadowing", threadIndex, "truthEventId"],
        "Foreshadowing truth must reference an existing event."
      );
    }
    validateContiguousOrder(
      thread.beats.map(({ order }, beatIndex) => ({
        index: beatIndex,
        order
      })),
      (beatIndex) => [
        "plot",
        "foreshadowing",
        threadIndex,
        "beats",
        beatIndex,
        "order"
      ],
      `Foreshadowing beats in ${thread.id}`,
      context
    );
    thread.beats.forEach((beat, beatIndex) => {
      if (beatById.has(beat.id)) {
        addIssue(
          context,
          ["plot", "foreshadowing", threadIndex, "beats", beatIndex, "id"],
          `Duplicate foreshadowing-beat id: ${beat.id}`
        );
      } else {
        beatById.set(beat.id, { beat, threadIndex, beatIndex });
      }
      const plannedVolumeId = beat.volumeId ?? null;
      const plannedArcId = beat.arcId ?? null;
      const plannedVolume =
        plannedVolumeId === null ? undefined : volumeById.get(plannedVolumeId);
      const plannedArc =
        plannedArcId === null ? undefined : arcById.get(plannedArcId);
      if (plannedVolumeId !== null && !plannedVolume) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "volumeId"
          ],
          "Foreshadowing beat must reference an existing planning volume."
        );
      }
      if (plannedArcId !== null && !plannedArc) {
        addIssue(
          context,
          ["plot", "foreshadowing", threadIndex, "beats", beatIndex, "arcId"],
          "Foreshadowing beat must reference an existing planning arc."
        );
      }
      if (
        plannedVolume &&
        plannedArc &&
        plannedArc.volumeId !== plannedVolume.id
      ) {
        addIssue(
          context,
          ["plot", "foreshadowing", threadIndex, "beats", beatIndex, "arcId"],
          "Foreshadowing beat planning arc must belong to its planning volume."
        );
      }
      if (beat.eventId !== null && !eventById.has(beat.eventId)) {
        addIssue(
          context,
          ["plot", "foreshadowing", threadIndex, "beats", beatIndex, "eventId"],
          "Foreshadowing beat must reference an existing event."
        );
      }
      const placement =
        beat.placementId === null
          ? undefined
          : placementById.get(beat.placementId);
      if (beat.placementId !== null && !placement) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "placementId"
          ],
          "Foreshadowing beat must reference an existing placement."
        );
      }
      if (beat.chapterCardId !== null && !chapterById.has(beat.chapterCardId)) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "chapterCardId"
          ],
          "Foreshadowing beat must reference an existing chapter card."
        );
      }
      const anchoredChapter =
        beat.chapterCardId !== null
          ? chapterById.get(beat.chapterCardId)
          : placement
            ? chapterById.get(placement.chapterCardId)
            : undefined;
      if (
        plannedVolume &&
        anchoredChapter &&
        anchoredChapter.volumeId !== plannedVolume.id
      ) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "volumeId"
          ],
          "Foreshadowing beat planning volume must match its concrete chapter."
        );
      }
      if (
        plannedArc &&
        anchoredChapter &&
        anchoredChapter.primaryArcId !== null &&
        anchoredChapter.primaryArcId !== plannedArc.id
      ) {
        addIssue(
          context,
          ["plot", "foreshadowing", threadIndex, "beats", beatIndex, "arcId"],
          "Foreshadowing beat planning arc must match its concrete chapter."
        );
      }
      const anchoredEvent =
        beat.eventId === null ? undefined : eventById.get(beat.eventId);
      if (
        plannedVolume &&
        anchoredEvent &&
        !anchoredEvent.arcIds.some(
          (arcId) => arcById.get(arcId)?.volumeId === plannedVolume.id
        )
      ) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "volumeId"
          ],
          "Foreshadowing beat planning volume must match its concrete event."
        );
      }
      if (
        plannedArc &&
        anchoredEvent &&
        !anchoredEvent.arcIds.includes(plannedArc.id)
      ) {
        addIssue(
          context,
          ["plot", "foreshadowing", threadIndex, "beats", beatIndex, "arcId"],
          "Foreshadowing beat planning arc must match its concrete event."
        );
      }
      if (
        placement &&
        beat.eventId !== null &&
        placement.eventId !== beat.eventId
      ) {
        addIssue(
          context,
          ["plot", "foreshadowing", threadIndex, "beats", beatIndex, "eventId"],
          "Foreshadowing beat event must match its placement event."
        );
      }
      if (placement && beat.status === "committed") {
        if (placement.status !== "committed") {
          addIssue(
            context,
            [
              "plot",
              "foreshadowing",
              threadIndex,
              "beats",
              beatIndex,
              "placementId"
            ],
            "A committed foreshadowing beat requires its bound placement to be committed."
          );
        }
        if (beat.eventId !== placement.eventId) {
          addIssue(
            context,
            [
              "plot",
              "foreshadowing",
              threadIndex,
              "beats",
              beatIndex,
              "eventId"
            ],
            "A committed foreshadowing beat must carry the same event as its bound placement."
          );
        }
        if (beat.commitId !== placement.commitId) {
          addIssue(
            context,
            [
              "plot",
              "foreshadowing",
              threadIndex,
              "beats",
              beatIndex,
              "commitId"
            ],
            "A committed foreshadowing beat and its bound placement must share one ledger commit."
          );
        }
      }
      if (
        placement &&
        beat.chapterCardId !== null &&
        placement.chapterCardId !== beat.chapterCardId
      ) {
        addIssue(
          context,
          [
            "plot",
            "foreshadowing",
            threadIndex,
            "beats",
            beatIndex,
            "chapterCardId"
          ],
          "Foreshadowing beat chapter must match its placement chapter."
        );
      }
    });
  });

  validateUniqueValues(
    snapshot.chapters.map(({ chapterCardId }) => chapterCardId),
    (index) => ["chapters", index, "chapterCardId"],
    "chapter file index",
    context
  );
  const chapterFilesById = new Map(
    snapshot.chapters.map((chapter) => [chapter.chapterCardId, chapter])
  );
  snapshot.chapters.forEach((chapter, index) => {
    if (!chapterById.has(chapter.chapterCardId)) {
      addIssue(
        context,
        ["chapters", index, "chapterCardId"],
        "Chapter file index must reference an existing chapter card."
      );
    }
    chapter.characterContinuity.forEach((character, characterIndex) => {
      if (!characterIds.has(character.characterId)) {
        addIssue(
          context,
          [
            "chapters",
            index,
            "characterContinuity",
            characterIndex,
            "characterId"
          ],
          "Chapter character continuity must reference an existing character."
        );
      }
    });
  });
  for (const chapterCard of chapterCards) {
    if (!chapterFilesById.has(chapterCard.id)) {
      addIssue(
        context,
        ["chapters"],
        `Missing three-file index for chapter ${chapterCard.id}.`
      );
    }
  }

  const allFiles: Array<{
    file: LongWorkspaceFileReference;
    path: ValidationPath;
  }> = [
    { file: snapshot.bookLine, path: ["bookLine"] },
    ...(snapshot.writeReceipts ?? []).map((file, index) => ({
      file,
      path: ["writeReceipts", index] as ValidationPath
    })),
    ...snapshot.worldbuilding.flatMap((category, index) =>
      category.format === "text"
        ? [
            {
              file: category.file,
              path: ["worldbuilding", index, "file"] as ValidationPath
            }
          ]
        : [
            ...(category.overview
              ? [
                  {
                    file: category.overview,
                    path: ["worldbuilding", index, "overview"] as ValidationPath
                  }
                ]
              : []),
            ...category.items.map((item, itemIndex) => ({
              file: item.file,
              path: [
                "worldbuilding",
                index,
                "items",
                itemIndex,
                "file"
              ] as ValidationPath
            }))
          ]
    ),
    ...(snapshot.characterOverview
      ? [
          {
            file: snapshot.characterOverview,
            path: ["characterOverview"] as ValidationPath
          }
        ]
      : []),
    ...snapshot.characterFiles.flatMap((entry, index) =>
      [
        ["coreProfile", entry.coreProfile],
        ["relationships", entry.relationships]
      ].map(([field, file]) => ({
        file: file as LongWorkspaceFileReference,
        path: ["characterFiles", index, field as string] as ValidationPath
      }))
    ),
    ...snapshot.chapters.flatMap((entry, index) =>
      [
        ["body", entry.body],
        ["card", entry.card],
        ["characterState", entry.characterState],
        ["handoff", entry.handoff],
        ["foreshadowingChanges", entry.foreshadowingChanges],
        ...(entry.worldReveals ? [["worldReveals", entry.worldReveals]] : []),
        ...entry.characterContinuity.flatMap((character, characterIndex) => [
          [
            `characterContinuity.${characterIndex}.currentState`,
            character.currentState
          ],
          [`characterContinuity.${characterIndex}.history`, character.history]
        ])
      ].map(([field, file]) => ({
        file: file as LongWorkspaceFileReference,
        path: ["chapters", index, field as string] as ValidationPath
      }))
    ),
    ...snapshot.plot.storyPlots.map((entry, index) => ({
      file: entry.file,
      path: ["plot", "storyPlots", index, "file"] as ValidationPath
    })),
    ...snapshot.ledger.commits.map((entry, index) => ({
      file: entry.recordFile,
      path: ["ledger", "commits", index, "recordFile"] as ValidationPath
    }))
  ];
  validateUniqueValues(
    allFiles.map(({ file }) => file.id),
    (index) => [...allFiles[index]!.path, "id"],
    "long-form file id",
    context
  );
  validateUniqueValues(
    allFiles.map(({ file }) =>
      file.path.normalize("NFC").toLocaleLowerCase("en-US")
    ),
    (index) => [...allFiles[index]!.path, "path"],
    "portable long-form file path",
    context
  );

  const commits = snapshot.ledger.commits;
  validateUniqueValues(
    commits.map(({ id }) => id),
    (index) => ["ledger", "commits", index, "id"],
    "ledger commit id",
    context
  );
  commits.forEach((commit, index) => {
    if (index > 0 && commit.sequence <= commits[index - 1]!.sequence) {
      addIssue(
        context,
        ["ledger", "commits", index, "sequence"],
        "Ledger record sequence must be strictly increasing and stored in order."
      );
    }
  });
  const orderedChapters = [...chapterCards].sort((left, right) => {
    const leftVolumeOrder =
      volumeById.get(left.volumeId)?.order ?? Number.MAX_SAFE_INTEGER;
    const rightVolumeOrder =
      volumeById.get(right.volumeId)?.order ?? Number.MAX_SAFE_INTEGER;
    return (
      leftVolumeOrder - rightVolumeOrder ||
      left.narrativeOrder - right.narrativeOrder
    );
  });
  const commitByChapterId = indexLedgerCommitMemberships(
    commits,
    chapterCards.map(({ id }) => id),
    context
  );
  const commitById = new Map(commits.map((commit) => [commit.id, commit]));
  const placementIdsByCommitId = new Map(
    commits.map((commit) => [commit.id, new Set(commit.placementIds)])
  );
  const beatIdsByCommitId = new Map(
    commits.map((commit) => [commit.id, new Set(commit.foreshadowingBeatIds)])
  );
  orderedChapters.forEach((chapter) => {
    const expectedCommitId = commitByChapterId.get(chapter.id)?.id ?? null;
    const fileIndex = chapterFilesById.get(chapter.id);
    if (fileIndex && fileIndex.commitId !== expectedCommitId) {
      const fileIndexPosition = snapshot.chapters.findIndex(
        ({ chapterCardId }) => chapterCardId === chapter.id
      );
      addIssue(
        context,
        ["chapters", fileIndexPosition, "commitId"],
        "Chapter record id must match its ledger record."
      );
    }
  });

  let expectedCommittedThrough: string | null = null;
  for (const chapter of orderedChapters) {
    if (!commitByChapterId.has(chapter.id)) break;
    expectedCommittedThrough = chapter.id;
  }
  if (snapshot.ledger.committedThroughChapterId !== expectedCommittedThrough) {
    addIssue(
      context,
      ["ledger", "committedThroughChapterId"],
      "Committed-through chapter must match the highest contiguous recorded chapter."
    );
  }

  commits.forEach((commit, commitIndex) => {
    const memberIds = new Set(longLedgerCommitChapterIds(commit));
    commit.placementIds.forEach((placementId, placementIndex) => {
      const placement = placementById.get(placementId);
      if (!placement) {
        addIssue(
          context,
          ["ledger", "commits", commitIndex, "placementIds", placementIndex],
          "Ledger placement decision must reference an existing placement."
        );
      } else {
        if (!memberIds.has(placement.chapterCardId)) {
          addIssue(
            context,
            ["ledger", "commits", commitIndex, "placementIds", placementIndex],
            "Ledger placement decision must belong to the committed chapter."
          );
        }
        if (placement.commitId !== commit.id) {
          addIssue(
            context,
            ["ledger", "commits", commitIndex, "placementIds", placementIndex],
            "Ledger placement decision must carry the same commit id."
          );
        }
      }
    });
    commit.foreshadowingBeatIds.forEach((beatId, beatIndex) => {
      const beatRecord = beatById.get(beatId);
      if (!beatRecord) {
        addIssue(
          context,
          ["ledger", "commits", commitIndex, "foreshadowingBeatIds", beatIndex],
          "Ledger beat decision must reference an existing beat."
        );
      } else {
        const { beat } = beatRecord;
        const beatPlacement =
          beat.placementId === null
            ? undefined
            : placementById.get(beat.placementId);
        const resolvedChapterId =
          beat.chapterCardId ?? beatPlacement?.chapterCardId;
        if (
          resolvedChapterId === undefined ||
          !memberIds.has(resolvedChapterId)
        ) {
          addIssue(
            context,
            [
              "ledger",
              "commits",
              commitIndex,
              "foreshadowingBeatIds",
              beatIndex
            ],
            "Ledger beat decision must resolve to and belong to the committed chapter."
          );
        }
        if (beat.commitId !== commit.id) {
          addIssue(
            context,
            [
              "ledger",
              "commits",
              commitIndex,
              "foreshadowingBeatIds",
              beatIndex
            ],
            "Ledger beat decision must carry the same commit id."
          );
        }
      }
    });
  });

  narrativePlacements.forEach((placement, index) => {
    const chapterCommit = commitByChapterId.get(placement.chapterCardId);
    if (chapterCommit && placement.commitId !== chapterCommit.id) {
      addIssue(
        context,
        ["plot", "narrativePlacements", index, "commitId"],
        "Every placement in a committed chapter must be decided by that chapter commit."
      );
    }
    if (!chapterCommit && placement.commitId !== null) {
      addIssue(
        context,
        ["plot", "narrativePlacements", index, "commitId"],
        "A placement in an uncommitted chapter cannot reference a ledger commit."
      );
    }
    if (placement.commitId === null) return;
    const commit = commitById.get(placement.commitId);
    if (!commit) {
      addIssue(
        context,
        ["plot", "narrativePlacements", index, "commitId"],
        "Placement commit id must reference an indexed ledger commit."
      );
    } else if (!placementIdsByCommitId.get(commit.id)!.has(placement.id)) {
      addIssue(
        context,
        ["plot", "narrativePlacements", index, "commitId"],
        "Committed placement must be indexed by its ledger commit."
      );
    }
  });
  for (const { beat, threadIndex, beatIndex } of beatById.values()) {
    const beatPlacement =
      beat.placementId === null
        ? undefined
        : placementById.get(beat.placementId);
    const resolvedChapterId =
      beat.chapterCardId ?? beatPlacement?.chapterCardId;
    const chapterCommit =
      resolvedChapterId === undefined || resolvedChapterId === null
        ? undefined
        : commitByChapterId.get(resolvedChapterId);
    if (chapterCommit && beat.commitId !== chapterCommit.id) {
      addIssue(
        context,
        ["plot", "foreshadowing", threadIndex, "beats", beatIndex, "commitId"],
        "Every foreshadowing beat in a committed chapter must be decided by that chapter commit."
      );
    }
    if (!chapterCommit && beat.commitId !== null) {
      addIssue(
        context,
        ["plot", "foreshadowing", threadIndex, "beats", beatIndex, "commitId"],
        "A foreshadowing beat without a committed chapter cannot reference a ledger commit."
      );
    }
    if (beat.commitId === null) continue;
    const commit = commitById.get(beat.commitId);
    if (!commit) {
      addIssue(
        context,
        ["plot", "foreshadowing", threadIndex, "beats", beatIndex, "commitId"],
        "Foreshadowing beat commit id must reference an indexed ledger commit."
      );
    } else if (!beatIdsByCommitId.get(commit.id)!.has(beat.id)) {
      addIssue(
        context,
        ["plot", "foreshadowing", threadIndex, "beats", beatIndex, "commitId"],
        "Committed foreshadowing beat must be indexed by its ledger commit."
      );
    }
  }

  const projection = snapshot.ledger.projection;
  const throughCommit =
    projection.throughCommitId === null
      ? undefined
      : commitById.get(projection.throughCommitId);
  if (projection.throughCommitId !== null && !throughCommit) {
    addIssue(
      context,
      ["ledger", "projection", "throughCommitId"],
      "Continuity projection watermark must reference an indexed ledger commit."
    );
  }
  if (
    projection.latestHandoff &&
    (() => {
      const sourceCommit = commitById.get(projection.latestHandoff.commitId);
      return (
        sourceCommit === undefined ||
        longLedgerCommitCheckpointChapterId(sourceCommit) !==
          projection.latestHandoff.chapterCardId
      );
    })()
  ) {
    addIssue(
      context,
      ["ledger", "projection", "latestHandoff", "chapterCardId"],
      "The latest continuity handoff chapter must match its source commit."
    );
  }

  const plotSubjectIds = new Set<string>([
    snapshot.bookId,
    ...volumes.map(({ id }) => id),
    ...arcs.map(({ id }) => id),
    ...chapterCards.map(({ id }) => id),
    ...storyEvents.map(({ id }) => id),
    ...storyPlots.map(({ id }) => id),
    ...eventConnections.map(({ id }) => id),
    ...narrativePlacements.map(({ id }) => id)
  ]);
  const foreshadowingSubjectIds = new Set<string>([
    ...foreshadowing.map(({ id }) => id),
    ...beatById.keys()
  ]);
  const projectionSubjectExists = (
    domain: LongContinuityDomain,
    subjectId: string
  ): boolean => {
    if (domain === "character" || domain === "relationship") {
      return characterIds.has(subjectId);
    }
    if (domain === "world") return worldbuildingIds.has(subjectId);
    if (domain === "plot") return plotSubjectIds.has(subjectId);
    return foreshadowingSubjectIds.has(subjectId);
  };
  const validateProjectionProvenance = (
    value: {
      sourceCommitId: string;
      sourceChapterCardId: string;
    },
    path: ValidationPath
  ): void => {
    const sourceCommit = commitById.get(value.sourceCommitId);
    if (!sourceCommit) {
      addIssue(
        context,
        [...path, "sourceCommitId"],
        "Continuity projection entries must reference an indexed source commit."
      );
      return;
    }
    if (
      longLedgerCommitCheckpointChapterId(sourceCommit) !==
      value.sourceChapterCardId
    ) {
      addIssue(
        context,
        [...path, "sourceChapterCardId"],
        "Continuity projection entry chapter must match its source commit."
      );
    }
    if (throughCommit && sourceCommit.sequence > throughCommit.sequence) {
      addIssue(
        context,
        [...path, "sourceCommitId"],
        "Continuity projection entries cannot come from after the projection watermark."
      );
    }
  };
  projection.facts.forEach((fact, index) => {
    const path = ["ledger", "projection", "facts", index] as ValidationPath;
    validateProjectionProvenance(fact, path);
    if (!projectionSubjectExists(fact.domain, fact.subjectId)) {
      addIssue(
        context,
        [...path, "subjectId"],
        "Continuity facts must reference an existing object in their domain."
      );
    }
  });
  projection.knowledge.forEach((knowledge, index) => {
    const path = ["ledger", "projection", "knowledge", index] as ValidationPath;
    validateProjectionProvenance(knowledge, path);
    if (
      knowledge.audienceType === "character" &&
      knowledge.audienceId !== null &&
      !characterIds.has(knowledge.audienceId)
    ) {
      addIssue(
        context,
        [...path, "audienceId"],
        "Character knowledge must reference an existing character."
      );
    }
  });
  projection.openLoops.forEach((loop, index) => {
    const path = ["ledger", "projection", "openLoops", index] as ValidationPath;
    validateProjectionProvenance(loop, path);
    if (
      loop.subjectId !== null &&
      loop.kind !== "knowledge" &&
      loop.kind !== "continuity" &&
      !projectionSubjectExists(loop.kind, loop.subjectId)
    ) {
      addIssue(
        context,
        [...path, "subjectId"],
        "Continuity open-loop subjects must reference an existing object in their domain."
      );
    }
  });
}

export const LongWorkspaceIndexSnapshotSchema =
  LongWorkspaceIndexSnapshotObjectSchema.superRefine(
    validateLongWorkspaceIndexSnapshot
  );
export type LongWorkspaceIndexSnapshot = z.infer<
  typeof LongWorkspaceIndexSnapshotSchema
>;
