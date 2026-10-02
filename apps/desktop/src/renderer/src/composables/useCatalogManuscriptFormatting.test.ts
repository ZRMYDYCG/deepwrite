import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, shallowRef } from "vue";
import type { EditorDraftState, WorkspaceDocument } from "../types/workspace";
import { uiMessage } from "../ui-feedback";
import { useCatalogManuscriptFormatting } from "./useCatalogManuscriptFormatting";

vi.mock("../ui-feedback", () => ({
  uiMessage: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn()
  }
}));

function document(
  id: string,
  content: string,
  patch: Partial<WorkspaceDocument> = {}
): WorkspaceDocument {
  return {
    id,
    domain: "creation",
    title: id,
    eyebrow: "正文",
    path: ["测试作品", "正文", id],
    content,
    workspaceId: "book-1",
    workspaceType: "short",
    draftFileKind: "body",
    catalogContentLoaded: true,
    ...patch
  };
}

function harness(initial: WorkspaceDocument[]) {
  const documents = shallowRef(initial);
  const drafts = shallowRef<Record<string, EditorDraftState>>({});
  const ensureLoaded = vi.fn(async (_ids: readonly string[]) => ({ ok: true }));
  const isWriteBlocked = vi.fn(() => false);
  const scheduleAutoSave = vi.fn();
  const stage = vi.fn(
    (changes: readonly { id: string; title: string; content: string }[]) => {
      drafts.value = {
        ...drafts.value,
        ...Object.fromEntries(
          changes.map((change) => [
            change.id,
            {
              ...change,
              dirty: true,
              recoveryUpdatedAt: "2026-01-01T00:00:00.000Z"
            }
          ])
        )
      };
    }
  );
  const api = useCatalogManuscriptFormatting({
    documents,
    drafts,
    ensureLoaded,
    isWriteBlocked,
    stage,
    scheduleAutoSave
  });
  return {
    api,
    documents,
    drafts,
    ensureLoaded,
    isWriteBlocked,
    scheduleAutoSave,
    stage
  };
}

beforeEach(() => vi.clearAllMocks());

describe("catalog manuscript formatting", () => {
  it("formats every body in the selected book and keeps newer unsaved text", async () => {
    const h = harness([
      document("first", "磁盘旧稿"),
      document("second", "第二段。\n第三段。"),
      document("state", "人物状态", { draftFileKind: "character-state" }),
      document("other", "其他作品", { workspaceId: "book-2" })
    ]);
    h.drafts.value = {
      first: {
        title: "改过的标题",
        content: "  未保存首段。\n未保存次段。",
        dirty: true,
        recoveryUpdatedAt: "2026-01-01T00:00:00.000Z"
      }
    };

    await h.api.formatAll("book-1", "short", "flush-spaced");

    expect(h.ensureLoaded).toHaveBeenCalledWith(["first", "second"]);
    expect(h.stage).toHaveBeenCalledOnce();
    expect(h.stage.mock.calls[0]![0]).toEqual([
      {
        id: "first",
        title: "改过的标题",
        content: "未保存首段。\n\n未保存次段。"
      },
      {
        id: "second",
        title: "second",
        content: "第二段。\n\n第三段。"
      }
    ]);
    expect(h.scheduleAutoSave.mock.calls.map(([id]) => id)).toEqual([
      "first",
      "second"
    ]);
    expect(h.drafts.value.state).toBeUndefined();
    expect(h.drafts.value.other).toBeUndefined();
    expect(uiMessage.success).toHaveBeenCalledWith("已规范 2 个正文的格式");
  });

  it("uses the screenplay rule only for screenplay bodies", async () => {
    const h = harness([
      document("episode", "对白。\n动作。", { workspaceType: "script" }),
      document("short", "短篇正文。\n第二段。")
    ]);
    await h.api.formatAll("book-1", "script", "indent-compact");
    expect(h.stage.mock.calls[0]![0]).toEqual([
      {
        id: "episode",
        title: "episode",
        content: "　　对白。\n　　动作。"
      }
    ]);
    expect(h.scheduleAutoSave).toHaveBeenCalledOnce();
  });

  it("does not publish partial changes if any body cannot be loaded", async () => {
    const h = harness([
      document("first", "首段。\n次段。"),
      document("second", "", { catalogContentLoaded: false })
    ]);
    h.ensureLoaded.mockResolvedValue({ ok: false });
    await h.api.formatAll("book-1", "short", "flush-spaced");
    expect(h.stage).not.toHaveBeenCalled();
    expect(h.scheduleAutoSave).not.toHaveBeenCalled();
    expect(uiMessage.error).toHaveBeenCalledWith(
      "未能读取全部正文，尚未修改格式，请重试"
    );
  });

  it("rechecks the book and write barrier after loading", async () => {
    const h = harness([document("first", "首段。\n次段。")]);
    h.ensureLoaded.mockImplementation(async () => {
      h.documents.value = [document("replacement", "另一节。")];
      return { ok: true };
    });
    await h.api.formatAll("book-1", "short", "flush-spaced");
    expect(h.stage).not.toHaveBeenCalled();

    h.documents.value = [document("first", "首段。\n次段。")];
    h.ensureLoaded.mockImplementation(async () => {
      h.isWriteBlocked.mockReturnValue(true);
      return { ok: true };
    });
    await h.api.formatAll("book-1", "short", "flush-spaced");
    expect(h.stage).not.toHaveBeenCalled();
    expect(uiMessage.warning).toHaveBeenCalled();
  });

  it("reports an unchanged book without creating drafts or saves", async () => {
    const h = harness([
      document("first", "首段。\n\n次段。"),
      document("second", "")
    ]);
    await h.api.formatAll("book-1", "short", "flush-spaced");
    expect(h.stage).not.toHaveBeenCalled();
    expect(h.scheduleAutoSave).not.toHaveBeenCalled();
    expect(uiMessage.info).toHaveBeenCalledWith("全部正文已符合格式规范");
  });

  it("ignores repeated clicks while reading all bodies", async () => {
    const h = harness([document("first", "首段。\n次段。")]);
    let finishRead!: (result: { ok: boolean }) => void;
    h.ensureLoaded.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        })
    );
    const first = h.api.formatAll("book-1", "short", "flush-spaced");
    expect(h.api.pending.value).toBe(true);
    await h.api.formatAll("book-1", "short", "flush-spaced");
    expect(h.ensureLoaded).toHaveBeenCalledOnce();
    finishRead({ ok: true });
    await first;
    expect(h.api.pending.value).toBe(false);
  });

  it("does not change drafts after the workspace closes during a read", async () => {
    const scope = effectScope();
    const h = scope.run(() => harness([document("first", "首段。\n次段。")]))!;
    let finishRead!: (result: { ok: boolean }) => void;
    h.ensureLoaded.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        })
    );
    const pending = h.api.formatAll("book-1", "short", "flush-spaced");
    scope.stop();
    finishRead({ ok: true });
    await pending;
    expect(h.stage).not.toHaveBeenCalled();
  });
});
