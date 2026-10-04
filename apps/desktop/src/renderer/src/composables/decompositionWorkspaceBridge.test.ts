import { ref } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { createEnvelope } from "@deepwrite/contracts/renderer";
import type {
  DecompositionContentRef,
  DecompositionTarget,
  DecompositionTargetUpdatedEvent
} from "@deepwrite/contracts";
import type { ResourceTreeNode } from "../types/workspace";
import { createDecompositionWorkspaceBridge } from "./decompositionWorkspaceBridge";

afterEach(() => vi.useRealTimers());
function fixture() {
  const nodes = [
    { id: "group_node", label: "合成素材分组", groupId: "group_fixture" },
    {
      id: "entry_node",
      label: "合成素材条目",
      libraryId: "library_fixture",
      catalogEntryId: "entry_fixture"
    },
    {
      id: "long-book:book_fixture",
      label: "合成长篇作品",
      catalogNodeType: "long-book",
      longBookId: "book_fixture"
    }
  ] as ResourceTreeNode[];
  const ports = {
    loadCatalog: vi.fn(async () => undefined),
    loadBooks: vi.fn(async () => undefined),
    refreshBook: vi.fn(async () => undefined),
    activeBookId: ref<string | null>("book_fixture"),
    navigate: vi.fn(async () => true),
    find: (predicate: (node: ResourceTreeNode) => boolean) =>
      nodes.find(predicate),
    select: vi.fn(async () => undefined)
  };
  return { ports, nodes, bridge: createDecompositionWorkspaceBridge(ports) };
}

it("成果引用打开实际长篇文档或素材条目，目标入口打开所属作品", async () => {
  const { ports, nodes, bridge } = fixture();
  await bridge.openRef({
    projectId: "book_fixture",
    fileId: "note_fixture"
  } as DecompositionContentRef);
  expect(ports.navigate).toHaveBeenCalledWith({
    kind: "long",
    bookId: "book_fixture",
    candidates: [{ kind: "file", fileId: "note_fixture" }]
  });
  await bridge.openRef({
    projectId: "library_fixture",
    resourceId: "entry_fixture"
  } as DecompositionContentRef);
  expect(ports.select).toHaveBeenLastCalledWith(nodes[1]);
  await bridge.openTarget({
    kind: "long",
    bookId: "book_fixture"
  } as DecompositionTarget);
  expect(ports.select).toHaveBeenLastCalledWith(nodes[2]);
  await bridge.openTarget({
    kind: "material-group",
    groupId: "group_fixture"
  } as DecompositionTarget);
  expect(ports.select).toHaveBeenLastCalledWith(nodes[0]);
  bridge.dispose();
});

it("合并章节回执刷新，只刷新当前长篇正文，并在销毁时取消待刷新", async () => {
  vi.useFakeTimers();
  const { ports, bridge } = fixture();
  const event = (targetKind: "long" | "material-group", projectIds: string[]) =>
    createEnvelope(
      "decomposition.target_updated",
      {
        jobId: "ldjob_fixture",
        targetKind,
        projectIds
      },
      { id: "event_fixture" }
    ) as DecompositionTargetUpdatedEvent;
  const first = bridge.handle(event("long", ["book_fixture"]));
  const second = bridge.handle(event("long", ["book_fixture", "other_book"]));
  const third = bridge.handle(event("material-group", ["library_fixture"]));
  await vi.advanceTimersByTimeAsync(150);
  await Promise.all([first, second, third]);
  expect(ports.refreshBook).toHaveBeenCalledExactlyOnceWith("book_fixture");
  expect(ports.loadBooks).toHaveBeenCalledTimes(2);
  expect(ports.loadCatalog).toHaveBeenCalledTimes(1);
  const pending = bridge.handle(event("long", ["book_fixture"]));
  bridge.dispose();
  await pending;
  await vi.advanceTimersByTimeAsync(150);
  expect(ports.refreshBook).toHaveBeenCalledTimes(1);
});
