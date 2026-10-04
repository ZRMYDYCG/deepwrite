import { nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useEditorSaveViewport } from "./useEditorSaveViewport";

function createEditor() {
  const setSelectionRange = vi.fn();
  const ownerDocument: { activeElement: unknown } = { activeElement: null };
  const focus = vi.fn(() => {
    ownerDocument.activeElement = element;
  });
  const element = {
    scrollTop: 0,
    selectionStart: 0,
    selectionEnd: 0,
    selectionDirection: "none" as const,
    setSelectionRange,
    ownerDocument,
    focus
  } as unknown as HTMLTextAreaElement;
  return { element, focus, ownerDocument, setSelectionRange };
}

describe("editor save viewport", () => {
  it("does not restore a pending save's selection or focus into an IME candidate", async () => {
    const { element, focus, ownerDocument, setSelectionRange } = createEditor();
    element.selectionStart = 10;
    element.selectionEnd = 10;
    ownerDocument.activeElement = element;
    const composing = ref(false);
    const remembered = vi.fn();
    const viewport = useEditorSaveViewport({
      editorInput: ref(element),
      documentKey: ref("document-a"),
      isEditView: () => true,
      isSaving: () => true,
      isComposing: () => composing.value,
      rememberScroll: remembered
    });
    viewport.preserveForDispatchedSave();
    composing.value = true;
    element.selectionStart = 12;
    element.selectionEnd = 14;
    ownerDocument.activeElement = null;
    viewport.captureBeforeRender();
    viewport.restoreAfterRender();
    await nextTick();
    expect(setSelectionRange).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    expect(remembered).not.toHaveBeenCalled();
  });

  it("restores scroll and selection around a dispatched manual save", async () => {
    const { element, focus, ownerDocument, setSelectionRange } = createEditor();
    element.scrollTop = 640;
    element.selectionStart = 820;
    element.selectionEnd = 835;
    element.selectionDirection = "forward";
    ownerDocument.activeElement = element;
    const editorInput = ref<HTMLTextAreaElement | null>(element);
    const saving = ref(false);
    const remembered = vi.fn();
    const viewport = useEditorSaveViewport({
      editorInput,
      documentKey: ref("document-a"),
      isEditView: () => true,
      isSaving: () => saving.value,
      rememberScroll: remembered
    });

    viewport.preserveForDispatchedSave();
    element.scrollTop = 0;
    element.selectionStart = 0;
    element.selectionEnd = 0;
    element.selectionDirection = "none";
    ownerDocument.activeElement = null;
    await nextTick();

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(setSelectionRange).toHaveBeenLastCalledWith(820, 835, "forward");
    expect(element.scrollTop).toBe(640);
    expect(remembered).toHaveBeenCalledWith("document-a", 640);
  });

  it("does not rewrite an unchanged DOM viewport after saving", async () => {
    const { element, setSelectionRange } = createEditor();
    element.scrollTop = 360;
    element.selectionStart = 420;
    element.selectionEnd = 420;
    const saving = ref(false);
    useEditorSaveViewport({
      editorInput: ref<HTMLTextAreaElement | null>(element),
      documentKey: ref("document-a"),
      isEditView: () => true,
      isSaving: () => saving.value,
      rememberScroll: vi.fn()
    });

    saving.value = true;
    await nextTick();
    saving.value = false;
    await nextTick();
    await nextTick();

    expect(setSelectionRange).not.toHaveBeenCalled();
    expect(element.scrollTop).toBe(360);
  });

  it("restores a viewport immediately after an intermediate component render", () => {
    const { element, setSelectionRange } = createEditor();
    element.scrollTop = 780;
    element.selectionStart = 960;
    element.selectionEnd = 975;
    element.selectionDirection = "forward";
    const viewport = useEditorSaveViewport({
      editorInput: ref<HTMLTextAreaElement | null>(element),
      documentKey: ref("document-a"),
      isEditView: () => true,
      isSaving: () => true,
      rememberScroll: vi.fn()
    });

    viewport.captureBeforeRender();
    element.scrollTop = 0;
    element.selectionStart = 0;
    element.selectionEnd = 0;
    element.selectionDirection = "none";
    viewport.restoreAfterRender();

    expect(element.scrollTop).toBe(780);
    expect(setSelectionRange).toHaveBeenCalledWith(960, 975, "forward");
  });

  it("preserves the viewport when transient readonly mode starts and ends", async () => {
    const { element, setSelectionRange } = createEditor();
    const transientlyReadOnly = ref(false);
    element.scrollTop = 720;
    element.selectionStart = 880;
    element.selectionEnd = 896;
    element.selectionDirection = "forward";
    useEditorSaveViewport({
      editorInput: ref<HTMLTextAreaElement | null>(element),
      documentKey: ref("document-a"),
      isEditView: () => true,
      isSaving: () => false,
      isTransientlyReadOnly: () => transientlyReadOnly.value,
      rememberScroll: vi.fn()
    });

    transientlyReadOnly.value = true;
    element.scrollTop = 0;
    element.selectionStart = 0;
    element.selectionEnd = 0;
    element.selectionDirection = "none";
    await nextTick();

    expect(element.scrollTop).toBe(720);
    expect(setSelectionRange).toHaveBeenLastCalledWith(880, 896, "forward");

    element.scrollTop = 940;
    element.selectionStart = 1120;
    element.selectionEnd = 1120;
    transientlyReadOnly.value = false;
    element.scrollTop = 0;
    element.selectionStart = 0;
    element.selectionEnd = 0;
    await nextTick();

    expect(element.scrollTop).toBe(940);
    expect(setSelectionRange).toHaveBeenLastCalledWith(1120, 1120, "none");
  });

  it("does not restore a readonly transition into another document", async () => {
    const { element, setSelectionRange } = createEditor();
    const transientlyReadOnly = ref(false);
    const documentKey = ref("document-a");
    element.scrollTop = 560;
    useEditorSaveViewport({
      editorInput: ref<HTMLTextAreaElement | null>(element),
      documentKey,
      isEditView: () => true,
      isSaving: () => false,
      isTransientlyReadOnly: () => transientlyReadOnly.value,
      rememberScroll: vi.fn()
    });

    transientlyReadOnly.value = true;
    documentKey.value = "document-b";
    element.scrollTop = 0;
    await nextTick();

    expect(element.scrollTop).toBe(0);
    expect(setSelectionRange).not.toHaveBeenCalled();
  });

  it("uses the latest viewport when an automatic save finishes", async () => {
    const { element, setSelectionRange } = createEditor();
    element.scrollTop = 240;
    element.selectionStart = 300;
    element.selectionEnd = 300;
    const editorInput = ref<HTMLTextAreaElement | null>(element);
    const saving = ref(false);
    const remembered = vi.fn();
    useEditorSaveViewport({
      editorInput,
      documentKey: ref("document-a"),
      isEditView: () => true,
      isSaving: () => saving.value,
      rememberScroll: remembered
    });

    saving.value = true;
    await nextTick();
    element.scrollTop = 910;
    element.selectionStart = 1250;
    element.selectionEnd = 1264;
    element.selectionDirection = "backward";
    saving.value = false;
    await nextTick();
    await nextTick();

    expect(setSelectionRange).not.toHaveBeenCalled();
    expect(element.scrollTop).toBe(910);
    expect(remembered).toHaveBeenLastCalledWith("document-a", 910);
  });

  it("does not copy the previous document scroll onto the next document during render", () => {
    const { element, setSelectionRange } = createEditor();
    const documentKey = ref("section-1");
    element.scrollTop = 880;
    element.selectionStart = 1200;
    element.selectionEnd = 1210;
    element.selectionDirection = "forward";
    const remembered = vi.fn();
    const viewport = useEditorSaveViewport({
      editorInput: ref<HTMLTextAreaElement | null>(element),
      documentKey,
      isEditView: () => true,
      isSaving: () => false,
      rememberScroll: remembered
    });

    documentKey.value = "section-2";
    viewport.captureBeforeRender();
    viewport.restoreAfterRender();

    expect(element.scrollTop).toBe(880);
    expect(setSelectionRange).not.toHaveBeenCalled();
    expect(remembered).not.toHaveBeenCalled();

    element.scrollTop = 40;
    element.selectionStart = 50;
    element.selectionEnd = 50;
    element.selectionDirection = "none";
    viewport.captureBeforeRender();
    element.scrollTop = 0;
    element.selectionStart = 0;
    element.selectionEnd = 0;
    viewport.restoreAfterRender();

    expect(element.scrollTop).toBe(40);
    expect(setSelectionRange).toHaveBeenCalledWith(50, 50, "none");
    expect(remembered).toHaveBeenCalledWith("section-2", 40);
  });

  it("does not restore a saved viewport into another document", async () => {
    const { element, setSelectionRange } = createEditor();
    element.scrollTop = 480;
    const documentKey = ref("document-a");
    const viewport = useEditorSaveViewport({
      editorInput: ref<HTMLTextAreaElement | null>(element),
      documentKey,
      isEditView: () => true,
      isSaving: () => false,
      rememberScroll: vi.fn()
    });

    viewport.preserveForDispatchedSave();
    documentKey.value = "document-b";
    await nextTick();

    expect(setSelectionRange).not.toHaveBeenCalled();
  });
});
