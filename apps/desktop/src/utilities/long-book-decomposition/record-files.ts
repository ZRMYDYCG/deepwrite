import type {
  LongWorkspaceFileReference,
  LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";

export function decompositionLongFiles(
  index: LongWorkspaceIndexSnapshot
): Map<string, LongWorkspaceFileReference> {
  const files = [
    ...index.chapters.flatMap((entry) => [
      entry.body,
      entry.card,
      entry.characterState,
      entry.handoff,
      entry.foreshadowingChanges,
      ...(entry.worldReveals ? [entry.worldReveals] : []),
      ...entry.characterContinuity.flatMap((item) => [
        item.currentState,
        item.history
      ])
    ]),
    ...index.characterFiles.flatMap((item) => [
      item.coreProfile,
      item.relationships
    ]),
    ...index.worldbuilding.flatMap((category) =>
      category.format === "text"
        ? [category.file]
        : [
            ...(category.overview ? [category.overview] : []),
            ...category.items.map(({ file }) => file)
          ]
    ),
    ...index.plot.storyPlots.map(({ file }) => file),
    index.bookLine,
    ...(index.characterOverview ? [index.characterOverview] : [])
  ];
  return new Map(files.map((file) => [file.id, file]));
}
