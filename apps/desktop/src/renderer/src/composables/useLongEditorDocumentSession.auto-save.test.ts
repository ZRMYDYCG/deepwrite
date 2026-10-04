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
import type {
  LongWorkspaceSelection,
  LongWorkspaceSelectionFile
} from "../types/longWorkspace";
import shellSource from "../WorkspaceShell.vue?raw";
import moduleSource from "../components/LongWorkspaceModule.vue?raw";
import editorSource from "../components/LongWorkspaceEditor.vue?raw";
import { useEditorComposition } from "./useEditorComposition";
import { useLongEditorHistory } from "./useLongEditorHistory";

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
  const selectedFile = ref<LongWorkspaceSelectionFile>();
  const readDocument = vi.fn(async () => ({
    file: selectedFile.value!.file,
    content: "初稿",
    offset: 0,
    totalCharacters: 2,
    nextOffset: null
  }));
  const composition = useEditorComposition();
  let history!: ReturnType<typeof useLongEditorHistory>;
  vi.stubGlobal("window", {
    deepwrite: { long: { writeDocument, readDocument } }
  });
  const app = renderer.createApp(
    defineComponent({
      setup() {
        useLongEditorDocumentSession({
          props,
          emit: () => {},
          documentStates,
          volumeOutlineDrafts: ref({}),
          plotPointSummaryDrafts: ref({}),
          currentSelectionFile: computed(() => selectedFile.value),
          currentReadOnly: computed(() => false),
          currentDirty: computed(() => false),
          currentIsStructuredText: computed(() => false),
          currentIsWorldbuildingList: computed(() => false),
          viewMode: ref("edit"),
          editorInput: ref(null),
          isComposing: composition.isComposing,
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
        history = useLongEditorHistory({
          documentStates,
          currentState: computed(() => documentStates.value[key]),
          currentSelectionFile: computed(() => ({
            file,
            role: "body" as const,
            label: "测试正文",
            readOnly: false
          })),
          currentVisibleContent: computed(
            () => documentStates.value[key]!.content
          ),
          currentReadOnly: computed(() => false),
          isDocumentContentBusy: computed(() => false),
          isDocumentSwitchPending: computed(() => false),
          canUseTextTools: computed(() => true),
          viewMode: ref("edit"),
          editorInput: ref(null),
          composition,
          characterCount: ref(2),
          stateKey: () => key,
          updateVisibleContent: (content) => {
            documentStates.value[key]!.content = content;
          },
          scrollEditorToRange: () => {},
          clearRecoveryRecordForKey: () => {},
          scheduleRecoveryWrite: () => {}
        });
        return () => null;
      }
    })
  );
  app.mount({});
  return {
    app,
    props,
    documentStates,
    file,
    key,
    writeDocument,
    readDocument,
    selectedFile,
    composition,
    history
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("long editor auto-save", () => {
  it("defers same-file reloads that would make an active IME candidate read-only", async () => {
    const editor = setupEditor();
    editor.selectedFile.value = {
      file: editor.file,
      role: "body",
      label: "测试正文",
      readOnly: false
    };
    await nextTick();
    editor.composition.start();
    editor.selectedFile.value = {
      ...editor.selectedFile.value!,
      file: { ...editor.file, updatedAt: "2026-01-01T00:00:01.000Z" }
    };
    await nextTick();
    expect(editor.readDocument).not.toHaveBeenCalled();
    expect(editor.documentStates.value[editor.key]!.loading).toBe(false);
    expect(editor.documentStates.value[editor.key]!.loaded).toBe(true);

    editor.composition.finish(() => {});
    await vi.waitFor(() => expect(editor.readDocument).toHaveBeenCalledOnce());
    editor.app.unmount();
  });

  it("preserves committed text when a deferred reload encounters the new dirty draft", async () => {
    const editor = setupEditor();
    editor.selectedFile.value = {
      file: editor.file,
      role: "body",
      label: "测试正文",
      readOnly: false
    };
    await nextTick();
    editor.composition.start();
    editor.selectedFile.value = {
      ...editor.selectedFile.value!,
      file: { ...editor.file, updatedAt: "2026-01-01T00:00:01.000Z" }
    };
    await nextTick();
    editor.composition.finish(() => {
      editor.documentStates.value[editor.key]!.content = "初稿你好";
    });
    await nextTick();
    await nextTick();
    expect(editor.readDocument).not.toHaveBeenCalled();
    expect(editor.documentStates.value[editor.key]!.content).toBe("初稿你好");
    editor.app.unmount();
  });

  it("keeps composition candidates out of saves and commits one undoable change", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("InputEvent", class {});
    const editor = setupEditor();
    editor.props.autoSaveEnabled = true;
    const input = { value: "初稿", selectionStart: 2, selectionEnd: 2 };
    const event = {
      currentTarget: input,
      timeStamp: 0
    } as unknown as CompositionEvent;
    editor.history.handleEditorCompositionStart(event);
    input.value = "初稿ni";
    input.selectionStart = input.selectionEnd = 4;
    const composingInput = {
      currentTarget: input,
      inputType: "insertCompositionText",
      isComposing: true,
      timeStamp: 1
    };
    editor.history.handleEditorBeforeInput(
      composingInput as unknown as InputEvent
    );
    editor.history.handleEditorInput(composingInput as unknown as Event);
    await nextTick();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(editor.writeDocument).not.toHaveBeenCalled();
    expect(editor.documentStates.value[editor.key]!.content).toBe("初稿");

    input.value = "初稿你好";
    editor.history.handleEditorCompositionEnd(event);
    await nextTick();
    await vi.advanceTimersByTimeAsync(800);
    expect(editor.writeDocument).toHaveBeenCalledExactlyOnceWith({
      bookId: "book-1",
      fileId: "file-1",
      content: "初稿你好"
    });
    expect(editor.history.textHistory.undo("初稿你好")?.content).toBe("初稿");
    editor.app.unmount();
  });

  it("cancels an older timer as soon as composition starts", async () => {
    vi.useFakeTimers();
    const editor = setupEditor();
    editor.props.autoSaveEnabled = true;
    editor.documentStates.value[editor.key]!.content = "第一稿";
    await nextTick();
    await vi.advanceTimersByTimeAsync(700);
    editor.composition.start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(editor.writeDocument).not.toHaveBeenCalled();
    editor.composition.finish(() => {
      editor.documentStates.value[editor.key]!.content = "第一稿你";
    });
    await nextTick();
    await vi.advanceTimersByTimeAsync(800);
    expect(editor.writeDocument).toHaveBeenCalledExactlyOnceWith({
      bookId: "book-1",
      fileId: "file-1",
      content: "第一稿你"
    });
    editor.app.unmount();
  });

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
