import { createScopedTranslator } from "../i18n";
import type {
  LongBookSummary,
  LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";
import type { ResourceTreeNode } from "../types/workspace";
import { createLongChapterSelection } from "../types/longWorkspace";

const t = createScopedTranslator("workspace");

type LongNavigationChapter =
  LongBookSummary["navigation"]["chapterCards"][number];
type LongNavigationVolume = LongBookSummary["navigation"]["volumes"][number];

function chapterStatusBadge(
  chapter: LongNavigationChapter,
  index?: LongWorkspaceIndexSnapshot | null
): string {
  const files = index?.chapters.find(
    ({ chapterCardId }) => chapterCardId === chapter.id
  );
  if (files && files.commitId !== null)
    return t("longWorkspaceDraftTree.completed");
  return (files?.bodyStatus ?? chapter.bodyStatus) === "written"
    ? t("longWorkspaceDraftTree.pendingCommit")
    : t("longWorkspaceDraftTree.notWritten");
}

export function projectLongWorkspaceDraftTree(input: {
  book: LongBookSummary;
  index?: LongWorkspaceIndexSnapshot | null;
  volumes: LongNavigationVolume[];
  chaptersByVolume: ReadonlyMap<string, LongNavigationChapter[]>;
  nodeId: (key: string) => string;
}): ResourceTreeNode[] {
  return input.volumes.map<ResourceTreeNode>((volume) => {
    const chapters = (
      input.chaptersByVolume.get(volume.id) ?? []
    ).flatMap<ResourceTreeNode>((chapter) => {
      const selection = input.index
        ? createLongChapterSelection(input.book, input.index, chapter.id)
        : {
            key: `chapter:${chapter.id}`,
            root: "draft" as const,
            chapterCardId: chapter.id,
            title: chapter.title,
            breadcrumbs: [
              input.book.title,
              t("catalogWorkspace.manuscript"),
              volume.title,
              chapter.title
            ],
            files: [],
            preferredRole: "body" as const
          };
      return selection
        ? [
            {
              id: input.nodeId(selection.key),
              label: selection.title,
              icon: "edit",
              badge: chapterStatusBadge(chapter, input.index),
              workspaceType: "long",
              longBookId: input.book.id,
              catalogNodeType: "category",
              longWorkspaceSelection: selection,
              selectableBranch: false
            }
          ]
        : [];
    });
    return {
      id: input.nodeId(`volume:${volume.id}`),
      label: volume.title,
      icon: "folder",
      badge: t("longWorkspaceResourceTree.chapters", {
        length: chapters.length
      }),
      workspaceType: "long",
      longBookId: input.book.id,
      catalogNodeType: "category",
      longDraftVolumeId: volume.id,
      ...(chapters.length ? { children: chapters } : {})
    };
  });
}
