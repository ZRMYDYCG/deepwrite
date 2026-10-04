import type {
  DecompositionContentRef,
  DecompositionTarget
} from "@deepwrite/contracts/renderer";
import type { Ref } from "vue";
import type { ResourceTreeNode } from "../types/workspace";
import type { ApprovalNavigationTarget } from "../utils/approvalNavigation";
import { createDecompositionTargetRefresh } from "./decompositionTargetRefresh";

/** Opens and refreshes the real resources written by the decomposition feature. */
export function createDecompositionWorkspaceBridge(ports: {
  loadCatalog(): Promise<unknown>;
  loadBooks(): Promise<unknown>;
  refreshBook(bookId: string): Promise<unknown>;
  activeBookId: Readonly<Ref<string | null>>;
  navigate(target: ApprovalNavigationTarget): Promise<boolean>;
  find(
    predicate: (node: ResourceTreeNode) => boolean
  ): ResourceTreeNode | undefined;
  select(node: ResourceTreeNode): Promise<unknown>;
}) {
  const refresh = createDecompositionTargetRefresh({
    async long(bookId) {
      if (ports.activeBookId.value === bookId) await ports.refreshBook(bookId);
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
      } else {
        const node = ports.find((node) => node.groupId === target.groupId);
        if (node) await ports.select(node);
      }
    }
  };
}
