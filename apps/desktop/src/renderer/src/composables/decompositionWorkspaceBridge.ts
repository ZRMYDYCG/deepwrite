import type {
  DecompositionContentRef,
  DecompositionTarget
} from "@deepwrite/contracts/renderer";
import type { Ref } from "vue";
import type { ResourceTreeNode, WorkspaceDocument } from "../types/workspace";
import type { ApprovalNavigationTarget } from "../utils/approvalNavigation";
import { createDecompositionTargetRefresh } from "./decompositionTargetRefresh";

/** Opens and refreshes the real resources written by the decomposition feature. */
export function createDecompositionWorkspaceBridge(ports: {
  loadCatalog(): Promise<unknown>;
  loadBooks(): Promise<unknown>;
  refreshBook(bookId: string): Promise<boolean>;
  activeBookId: Readonly<Ref<string | null>>;
  navigate(target: ApprovalNavigationTarget): Promise<boolean>;
  find(
    predicate: (node: ResourceTreeNode) => boolean
  ): ResourceTreeNode | undefined;
  select(node: ResourceTreeNode): Promise<unknown>;
  documentForResourceId(id: string): WorkspaceDocument | undefined;
  unavailable(): void;
}) {
  function openingDocument(
    node: ResourceTreeNode | undefined
  ): ResourceTreeNode | undefined {
    if (!node || node.unavailable || node.missing) return undefined;
    if (ports.documentForResourceId(node.id)) return node;
    for (const child of node.children ?? []) {
      const document = openingDocument(child);
      if (document) return document;
    }
    return undefined;
  }
  const refresh = createDecompositionTargetRefresh({
    async long(bookId) {
      if (ports.activeBookId.value === bookId) {
        const published = await ports.refreshBook(bookId);
        if (published && ports.activeBookId.value === bookId) return;
      }
      await ports.loadBooks();
    },
    materials: ports.loadCatalog
  });
  return {
    handle: refresh.handle,
    dispose: refresh.dispose,
    async openRef(ref: DecompositionContentRef): Promise<void> {
      await ports.loadCatalog();
      if (ref.fileId) {
        await ports.loadBooks();
        await ports.navigate({
          kind: "long",
          bookId: ref.projectId,
          candidates: [{ kind: "file", fileId: ref.fileId }]
        });
      } else {
        const node = ports.find(
          (node) =>
            node.libraryId === ref.projectId &&
            node.catalogEntryId === ref.resourceId
        );
        if (node) await ports.select(node);
      }
    },
    async openTarget(target: DecompositionTarget): Promise<void> {
      await ports.loadCatalog();
      if (target.kind === "long") {
        await ports.loadBooks();
        const node = ports.find(
          (node) =>
            node.catalogNodeType === "long-book" &&
            node.longBookId === target.bookId &&
            !node.unavailable &&
            !node.missing
        );
        if (node) await ports.select(node);
        else ports.unavailable();
      } else {
        const group = ports.find(
          (node) =>
            node.catalogNodeType === "group" && node.groupId === target.groupId
        );
        const node = openingDocument(group);
        if (node) await ports.select(node);
        else ports.unavailable();
      }
    }
  };
}
