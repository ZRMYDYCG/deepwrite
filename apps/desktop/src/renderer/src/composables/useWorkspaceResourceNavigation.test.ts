import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResourceTreeNode, WorkspaceDocument } from "../types/workspace";
import type { WorkspaceResourceCoordinatorOptions } from "./useWorkspaceResourceCoordinator";
import { useWorkspaceResourceNavigation } from "./useWorkspaceResourceNavigation";

const resources = vi.hoisted(() => ({
  findResourceNodeWhere: vi.fn(),
  documentForResourceId: vi.fn(),
  selectResource: vi.fn(),
  liveWorkspaceDocuments: { value: [] as WorkspaceDocument[] }
}));
vi.mock("./useWorkspaceResourceCoordinator", () => ({
  useWorkspaceResourceCoordinator: () => resources
}));
vi.mock("vue", async (original) => ({
  ...(await original<typeof import("vue")>()),
  provide: vi.fn()
}));
vi.mock("../i18n", () => ({ t: (key: string) => key }));

function fixture() {
  const openBook = vi.fn().mockResolvedValue(undefined);
  const showConversation = vi.fn();
  const warning = vi.fn();
  const activeBookId = ref<string | null>("book_long");
  const options = {
    state: { selectedResourceId: ref("") },
    tree: { lookup: ref({ nodeById: new Map() }) },
    longNavigation: { openBook, activeBookId },
    showConversation,
    notifications: { warning }
  } as unknown as WorkspaceResourceCoordinatorOptions;
  return {
    navigation: useWorkspaceResourceNavigation(options),
    openBook,
    activeBookId,
    showConversation,
    warning
  };
}

function document(
  id: string,
  extra: Partial<WorkspaceDocument> = {}
): WorkspaceDocument {
  return {
    id,
    domain: "creation",
    title: "测试条目",
    eyebrow: "正文",
    path: ["测试作品", "正文"],
    content: "正文内容",
    ...extra
  };
}

beforeEach(() => {
  resources.findResourceNodeWhere.mockReset();
  resources.documentForResourceId.mockReset();
  resources.selectResource.mockReset().mockResolvedValue(undefined);
  resources.liveWorkspaceDocuments.value = [];
});

describe("workspace resource navigation", () => {
  it.each(["short", "script"] as const)(
    "opens a %s book at its character document through existing tree selection",
    async (projectType) => {
      const characterNode: ResourceTreeNode = {
        id: "book_a:characters",
        label: "人物",
        stageCategoryId: "character_design"
      };
      const bookNode: ResourceTreeNode = {
        id: "book_a",
        label: "样书",
        catalogNodeType: "book",
        children: [characterNode]
      };
      resources.findResourceNodeWhere.mockImplementation((predicate) =>
        predicate(bookNode) ? bookNode : undefined
      );
      resources.documentForResourceId.mockImplementation((id) =>
        id === characterNode.id ? document(id) : undefined
      );
      const { navigation, showConversation, openBook } = fixture();
      await navigation.openIdentityBook({ projectType, projectId: "book_a" });
      expect(resources.selectResource).toHaveBeenCalledWith(characterNode);
      expect(openBook).not.toHaveBeenCalled();
      expect(showConversation).not.toHaveBeenCalled();
    }
  );

  it("opens a long book through the worldbuilding tree selection", async () => {
    const worldbuildingNode: ResourceTreeNode = {
      id: "long-book:book_long:root:worldbuilding",
      label: "世界观",
      longBookId: "book_long",
      longWorkspaceSelection: {
        key: "root:worldbuilding",
        root: "worldbuilding",
        title: "世界观",
        breadcrumbs: ["样书", "世界观"],
        files: [],
        preferredRole: "content"
      }
    };
    const bookNode: ResourceTreeNode = {
      id: "long-book:book_long",
      label: "样书",
      catalogNodeType: "long-book",
      longBookId: "book_long",
      children: [worldbuildingNode]
    };
    resources.findResourceNodeWhere.mockImplementation((predicate) =>
      predicate(bookNode) ? bookNode : undefined
    );
    const { navigation, openBook, showConversation } = fixture();
    await navigation.openIdentityBook({
      projectType: "long",
      projectId: "book_long"
    });
    expect(resources.selectResource).toHaveBeenCalledWith(worldbuildingNode);
    expect(openBook).not.toHaveBeenCalled();
    expect(showConversation).not.toHaveBeenCalled();
  });

  it("keeps the current feature and warns when a short book is absent from the tree", async () => {
    const { navigation, showConversation, warning } = fixture();
    await navigation.openIdentityBook({
      projectType: "short",
      projectId: "missing"
    });
    expect(resources.selectResource).not.toHaveBeenCalled();
    expect(showConversation).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      "components.workspaceShell.theTargetEntryNoLongerExists"
    );
  });

  it.each([
    [{ workspaceId: "book_a", libraryId: "library_a" }, "book_a"],
    [{ libraryId: "library_a" }, "library_a"],
    [{}, "entry_a"]
  ] as const)(
    "navigates entry search with its existing owner fallback",
    async (extra, workspaceId) => {
      resources.liveWorkspaceDocuments.value = [document("entry_a", extra)];
      const { navigation, warning } = fixture();
      const navigate = vi.fn().mockResolvedValue(true);
      await navigation.selectEditorEntrySearchResult("entry_a", navigate);
      expect(navigate).toHaveBeenCalledWith({
        kind: "document",
        workspaceId,
        documentId: "entry_a"
      });
      expect(warning).not.toHaveBeenCalled();
    }
  );

  it("warns when an entry vanished and when existing approval navigation refuses the target", async () => {
    const { navigation, warning } = fixture();
    const navigate = vi.fn().mockResolvedValue(false);
    await navigation.selectEditorEntrySearchResult("entry_a", navigate);
    expect(navigate).not.toHaveBeenCalled();
    expect(warning).toHaveBeenLastCalledWith(
      "components.workspaceShell.theTargetEntryNoLongerExists"
    );
    resources.liveWorkspaceDocuments.value = [document("entry_a")];
    await navigation.selectEditorEntrySearchResult("entry_a", navigate);
    expect(warning).toHaveBeenLastCalledWith(
      "components.workspaceShell.theTargetEntryCannotBeOpenedRightNow"
    );
  });

  it("uses the active long book for entry search and preserves a failed-navigation warning", async () => {
    const { navigation, activeBookId, warning } = fixture();
    const navigate = vi.fn().mockResolvedValue(false);
    await navigation.selectLongEntrySearchResult("file_a", navigate);
    expect(navigate).toHaveBeenCalledWith({
      kind: "long",
      bookId: "book_long",
      candidates: [{ kind: "file", fileId: "file_a" }]
    });
    expect(warning).toHaveBeenCalledWith(
      "components.workspaceShell.theTargetNovelEntryCannotBeOpenedRightNow"
    );
    navigate.mockClear();
    activeBookId.value = null;
    await navigation.selectLongEntrySearchResult("file_a", navigate);
    expect(navigate).not.toHaveBeenCalled();
  });
});
