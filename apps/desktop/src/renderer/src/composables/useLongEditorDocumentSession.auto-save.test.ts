import {
  computed,
  createRenderer,
  defineComponent,
  nextTick,
  reactive,
  ref
} from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LongFileId } from "@deepwrite/contracts";
import {
  useLongEditorDocumentSession,
  type LongDocumentState
} from "./useLongEditorDocumentSession";
import type { LongWorkspaceSelection } from "../types/longWorkspace";
import shellSource from "../WorkspaceShell.vue?raw";
import moduleSource from "../components/LongWorkspaceModule.vue?raw";
import editorSource from "../components/LongWorkspaceEditor.vue?raw";

const renderer = createRenderer({
  patchProp: () => {},
  insert: () => {},
  remove: () => {},
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText: () => {},
  setElementText: () => {},
  parentNode: () => null,
  nextSibling: () => null
});

function setupEditor() {
  const file = {
    id: "file-1" as LongFileId,
    path: "draft/chapter.md",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  const key = `book-1\u0000${file.id}`;
  const props = reactive({
    bookId: "book-1",
    selection: null as LongWorkspaceSelection | null,
    autoSaveEnabled: false,
    locked: false
  });
  const documentStates = ref<Record<string, LongDocumentState>>({
    [key]: {
      bookId: props.bookId,
      file,
      content: "初稿",
      savedContent: "初稿",
      loading: false,
      saving: false,
      loaded: true,
      loadError: null
    }
  });
  const writeDocument = vi.fn(async () => ({ file }));
  vi.stubGlobal("window", { deepwrite: { long: { writeDocument } } });
  const app = renderer.createApp(
    defineComponent({
      setup() {
        useLongEditorDocumentSession({
          props,
          emit: () => {},
          documentStates,
          volumeOutlineDrafts: ref({}),
          plotPointSummaryDrafts: ref({}),
          currentSelectionFile: computed(() => undefined),
          currentReadOnly: computed(() => false),
          currentDirty: computed(() => false),
          currentIsStructuredText: computed(() => false),
          currentIsWorldbuildingList: computed(() => false),
          viewMode: ref("edit"),
          editorInput: ref(null),
          activeWorldbuildingItemId: ref(null),
          activeBookLineVolumeId: ref(null),
          activeBookLineContentTab: ref("outline"),
          activePlotPointTab: ref("summary"),
          activeStoryPlotId: ref(null),
          saveVolumeOutline: async () => true,
          savePlotPointContent: async () => true,
          readRecoveryRecord: () => null,
          clearRecoveryRecordForKey: () => {},
          persistRecoveryForKey: () => {}
        });
        return () => null;
      }
    })
  );
  app.mount({});
  return { app, props, documentStates, file, key, writeDocument };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("long editor auto-save", () => {
  it("passes the general setting through to the editor and footer", () => {
    expect(shellSource).toContain(':auto-save-enabled="editorAutoSaveEnabled"');
    expect(moduleSource).toContain(':auto-save-enabled="autoSaveEnabled"');
    expect(editorSource).toContain(
      ':auto-save-enabled="autoSaveEnabled || currentIsForeshadowingView"'
    );
  });

  it("follows the setting and saves the latest draft after typing stops", async () => {
    vi.useFakeTimers();
    const editor = setupEditor();
    editor.documentStates.value[editor.key]!.content = "第一稿";
    await nextTick();
    await vi.advanceTimersByTimeAsync(900);
    expect(editor.writeDocument).not.toHaveBeenCalled();

    editor.props.autoSaveEnabled = true;
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);
    editor.documentStates.value[editor.key]!.content = "第二稿";
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);
    expect(editor.writeDocument).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(editor.writeDocument).toHaveBeenCalledExactlyOnceWith({
      bookId: "book-1",
      fileId: "file-1",
      content: "第二稿"
    });
    expect(editor.documentStates.value[editor.key]!.savedContent).toBe(
      "第二稿"
    );

    editor.documentStates.value[editor.key]!.content = "第三稿";
    await nextTick();
    editor.props.autoSaveEnabled = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(900);
    expect(editor.writeDocument).toHaveBeenCalledTimes(1);
    editor.app.unmount();
  });

  it("saves edits made while an earlier write is still in progress", async () => {
    vi.useFakeTimers();
    const editor = setupEditor();
    let finishFirstWrite:
      ((result: { file: typeof editor.file }) => void) | null = null;
    editor.writeDocument.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirstWrite = resolve;
        })
    );
    editor.props.autoSaveEnabled = true;
    editor.documentStates.value[editor.key]!.content = "第一稿";
    await nextTick();
    await vi.advanceTimersByTimeAsync(800);
    expect(editor.writeDocument).toHaveBeenCalledTimes(1);

    editor.documentStates.value[editor.key]!.content = "第二稿";
    await nextTick();
    await vi.advanceTimersByTimeAsync(800);
    expect(editor.writeDocument).toHaveBeenCalledTimes(1);
    expect(finishFirstWrite).not.toBeNull();
    finishFirstWrite!({ file: editor.file });
    await vi.advanceTimersByTimeAsync(0);
    expect(editor.writeDocument).toHaveBeenCalledTimes(2);
    expect(editor.writeDocument).toHaveBeenLastCalledWith({
      bookId: "book-1",
      fileId: "file-1",
      content: "第二稿"
    });
    expect(editor.documentStates.value[editor.key]!.savedContent).toBe(
      "第二稿"
    );
    editor.app.unmount();
  });
});
