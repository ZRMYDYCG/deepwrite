import { nextTick, watch, type Ref } from "vue";

interface EditorViewportSnapshot {
  documentKey: string;
  scrollTop: number;
  selectionStart: number;
  selectionEnd: number;
  selectionDirection: "forward" | "backward" | "none";
  focused: boolean;
}

interface EditorSaveViewportOptions {
  editorInput: Readonly<Ref<HTMLTextAreaElement | null | undefined>>;
  documentKey: Readonly<Ref<string>>;
  isEditView(): boolean;
  isSaving(): boolean;
  isComposing?(): boolean;
  isTransientlyReadOnly?(): boolean;
  rememberScroll(documentKey: string, scrollTop: number): void;
}

/** Keeps same-document renders invisible to the active text viewport. */
export function useEditorSaveViewport(options: EditorSaveViewportOptions) {
  let pendingSnapshot: EditorViewportSnapshot | null = null;
  let renderSnapshot: EditorViewportSnapshot | null = null;
  let readonlyTransitionRevision = 0;
  // Props change before the textarea is patched, so the visible scroll still
  // belongs to the previous document until this render finishes.
  let renderedDocumentKey = options.documentKey.value;

  function capture(): EditorViewportSnapshot | null {
    const input = options.editorInput.value;
    if (
      !input ||
      options.isComposing?.() ||
      !options.isEditView() ||
      options.documentKey.value !== renderedDocumentKey
    ) {
      return null;
    }
    return {
      documentKey: renderedDocumentKey,
      scrollTop: input.scrollTop,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
      selectionDirection: input.selectionDirection,
      focused: input.ownerDocument?.activeElement === input
    };
  }

  function restoreImmediately(snapshot: EditorViewportSnapshot | null): void {
    if (!snapshot) return;
    if (
      !options.isEditView() ||
      options.isComposing?.() ||
      options.documentKey.value !== snapshot.documentKey
    ) {
      return;
    }
    const input = options.editorInput.value;
    if (!input) return;
    if (snapshot.focused && input.ownerDocument.activeElement !== input) {
      input.focus({ preventScroll: true });
    }
    if (
      input.selectionStart !== snapshot.selectionStart ||
      input.selectionEnd !== snapshot.selectionEnd ||
      input.selectionDirection !== snapshot.selectionDirection
    ) {
      input.setSelectionRange(
        snapshot.selectionStart,
        snapshot.selectionEnd,
        snapshot.selectionDirection
      );
    }
    if (Math.abs(input.scrollTop - snapshot.scrollTop) > 0.5) {
      input.scrollTop = snapshot.scrollTop;
    }
    options.rememberScroll(snapshot.documentKey, snapshot.scrollTop);
  }

  async function restore(
    snapshot: EditorViewportSnapshot | null
  ): Promise<void> {
    if (!snapshot) return;
    await nextTick();
    restoreImmediately(snapshot);
  }

  function captureBeforeRender(): void {
    renderSnapshot = capture();
  }

  function restoreAfterRender(): void {
    const snapshot = renderSnapshot;
    renderSnapshot = null;
    renderedDocumentKey = options.documentKey.value;
    restoreImmediately(snapshot);
  }

  function preserveForReadonlyTransition(): void {
    const snapshot = capture();
    const revision = ++readonlyTransitionRevision;
    void nextTick(() => {
      if (revision !== readonlyTransitionRevision) return;
      restoreImmediately(snapshot);
    });
  }

  function preserveForDispatchedSave(): void {
    const snapshot = capture();
    pendingSnapshot = snapshot;
    void restore(snapshot).then(() => {
      if (!options.isSaving() && pendingSnapshot === snapshot) {
        pendingSnapshot = null;
      }
    });
  }

  watch(
    options.isSaving,
    (saving, wasSaving) => {
      if (saving) {
        if (!wasSaving) pendingSnapshot = capture() ?? pendingSnapshot;
        return;
      }
      if (!wasSaving) return;

      // Capture again before Vue patches the save result. The user may have
      // kept typing or scrolling while the write was in flight.
      const snapshot = capture() ?? pendingSnapshot;
      pendingSnapshot = null;
      void restore(snapshot);
    },
    { flush: "pre" }
  );

  if (options.isTransientlyReadOnly) {
    watch(options.isTransientlyReadOnly, preserveForReadonlyTransition, {
      flush: "sync"
    });
  }

  return {
    captureBeforeRender,
    preserveForDispatchedSave,
    restoreAfterRender
  };
}
