import type { TextViewMode } from "@deepwrite/contracts";
import { computed, nextTick, ref, type ComputedRef, type Ref } from "vue";
import type { LongWorkspaceSelectionFile } from "../types/longWorkspace";
import {
  countNonWhitespaceCharacters,
  createBoundedTextHistory,
  type TextHistoryRestoreResult,
  type TextSelectionRange
} from "../utils/boundedTextHistory";
import type { LongDocumentState } from "./useLongEditorDocumentSession";
import type { EditorComposition } from "./useEditorComposition";

export function useLongEditorHistory(options: {
  documentStates: Ref<Record<string, LongDocumentState>>;
  currentState: ComputedRef<LongDocumentState | undefined>;
  currentSelectionFile: ComputedRef<LongWorkspaceSelectionFile | undefined>;
  currentVisibleContent: ComputedRef<string>;
  currentReadOnly: ComputedRef<boolean>;
  isDocumentContentBusy: ComputedRef<boolean>;
  isDocumentSwitchPending: ComputedRef<boolean>;
  canUseTextTools: ComputedRef<boolean>;
  viewMode: Ref<TextViewMode>;
  editorInput: Ref<HTMLTextAreaElement | null>;
  composition: EditorComposition;
  characterCount: Ref<number>;
  stateKey: (fileId: string, bookId?: string) => string;
  updateVisibleContent: (content: string) => void;
  scrollEditorToRange: (input: HTMLTextAreaElement, start: number) => void;
  clearRecoveryRecordForKey: (
    key: string,
    bookId: string,
    fileId: string
  ) => void;
  scheduleRecoveryWrite: (key: string) => void;
}): {
  textHistory: ReturnType<typeof createBoundedTextHistory>;
  historyVersion: Ref<number>;
  canUndo: ComputedRef<boolean>;
  canRedo: ComputedRef<boolean>;
  resetEditorHistory: () => void;
  notifyHistoryChanged: () => void;
  handleEditorBeforeInput: (event: InputEvent) => void;
  handleEditorInput: (event: Event) => void;
  handleEditorCompositionStart: (event: CompositionEvent) => void;
  handleEditorCompositionEnd: (event: CompositionEvent) => void;
  recordProgrammaticChange: (
    nextContent: string,
    selectionAfter: TextSelectionRange
  ) => number | undefined;
  updateVisibleCharacterCount: (
    nextContent: string,
    nonWhitespaceDelta?: number
  ) => void;
  restoreEditorHistory: (result: TextHistoryRestoreResult) => Promise<void>;
  undo: () => void;
  redo: () => void;
  updateCurrentContent: (content: string) => void;
  getEditorSelection: (fallback?: number) => TextSelectionRange;
} {
  const textHistory = createBoundedTextHistory();
  const historyVersion = ref(0);
  let pendingEditorInput: {
    selectionBefore: TextSelectionRange;
    inputType: string;
    timestamp: number;
  } | null = null;
  const canUndo = computed(() => {
    void historyVersion.value;
    return (
      options.canUseTextTools.value &&
      !options.currentReadOnly.value &&
      textHistory.canUndo
    );
  });
  const canRedo = computed(() => {
    void historyVersion.value;
    return (
      options.canUseTextTools.value &&
      !options.currentReadOnly.value &&
      textHistory.canRedo
    );
  });

  function resetEditorHistory(): void {
    options.composition.reset();
    pendingEditorInput = null;
    textHistory.clear();
    historyVersion.value += 1;
  }

  function getEditorSelection(
    fallback = options.currentVisibleContent.value.length
  ): TextSelectionRange {
    const input = options.editorInput.value;
    return {
      start: input?.selectionStart ?? fallback,
      end: input?.selectionEnd ?? fallback
    };
  }

  function notifyHistoryChanged(): void {
    historyVersion.value += 1;
  }

  function updateCurrentContent(content: string): void {
    const state = options.currentState.value;
    const file = options.currentSelectionFile.value;
    if (
      !state ||
      !file ||
      options.currentReadOnly.value ||
      state.loading ||
      !state.loaded ||
      options.isDocumentSwitchPending.value
    ) {
      return;
    }
    const key = options.stateKey(file.file.id);
    // `documentStates` is deeply reactive. Mutating this one hot field avoids
    // cloning every open document entry for each keystroke.
    state.content = content;
    if (content === state.savedContent) {
      options.clearRecoveryRecordForKey(key, state.bookId, state.file.id);
    } else {
      options.scheduleRecoveryWrite(key);
    }
  }

  function handleEditorBeforeInput(event: InputEvent): void {
    if (
      options.currentReadOnly.value ||
      options.composition.isComposingInput(event)
    )
      return;
    if (event.inputType === "historyUndo") {
      event.preventDefault();
      pendingEditorInput = null;
      undo();
      return;
    }
    if (event.inputType === "historyRedo") {
      event.preventDefault();
      pendingEditorInput = null;
      redo();
      return;
    }
    const input = event.currentTarget as HTMLTextAreaElement;
    pendingEditorInput = {
      selectionBefore: {
        start:
          input.selectionStart ?? options.currentVisibleContent.value.length,
        end: input.selectionEnd ?? options.currentVisibleContent.value.length
      },
      inputType: event.inputType,
      timestamp: event.timeStamp
    };
  }

  function handleEditorInput(event: Event): void {
    if (
      options.currentReadOnly.value ||
      options.isDocumentContentBusy.value ||
      options.composition.isComposingInput(event)
    )
      return;
    const input = event.currentTarget as HTMLTextAreaElement;
    const beforeContent = options.currentVisibleContent.value;
    const afterContent = input.value;
    const selectionAfter = {
      start: input.selectionStart ?? afterContent.length,
      end: input.selectionEnd ?? afterContent.length
    };
    const pending = pendingEditorInput;
    pendingEditorInput = null;
    const historyResult = textHistory.recordInput({
      beforeContent,
      afterContent,
      selectionBefore: pending?.selectionBefore ?? selectionAfter,
      selectionAfter,
      inputType:
        pending?.inputType ??
        (event instanceof InputEvent ? event.inputType : ""),
      timestamp: pending?.timestamp ?? event.timeStamp
    });
    if (historyResult) {
      notifyHistoryChanged();
    }
    options.updateVisibleContent(afterContent);
    updateVisibleCharacterCount(
      afterContent,
      historyResult?.nonWhitespaceDelta
    );
  }

  function handleEditorCompositionStart(event: CompositionEvent): void {
    if (options.currentReadOnly.value || options.isDocumentContentBusy.value)
      return;
    const input = event.currentTarget as HTMLTextAreaElement;
    pendingEditorInput = {
      selectionBefore: { start: input.selectionStart, end: input.selectionEnd },
      inputType: "",
      timestamp: event.timeStamp
    };
    options.composition.start();
  }

  function handleEditorCompositionEnd(event: CompositionEvent): void {
    options.composition.finish(() => handleEditorInput(event));
  }

  function recordProgrammaticChange(
    nextContent: string,
    selectionAfter: TextSelectionRange
  ): number | undefined {
    const result = textHistory.recordChange({
      beforeContent: options.currentVisibleContent.value,
      afterContent: nextContent,
      selectionBefore: getEditorSelection(),
      selectionAfter
    });
    if (result) {
      notifyHistoryChanged();
    }
    return result?.nonWhitespaceDelta;
  }

  function updateVisibleCharacterCount(
    nextContent: string,
    nonWhitespaceDelta?: number
  ): void {
    if (options.currentVisibleContent.value !== nextContent) return;
    options.characterCount.value =
      nonWhitespaceDelta === undefined
        ? countNonWhitespaceCharacters(nextContent)
        : Math.max(0, options.characterCount.value + nonWhitespaceDelta);
  }

  async function restoreEditorHistory(
    result: TextHistoryRestoreResult
  ): Promise<void> {
    options.viewMode.value = "edit";
    options.updateVisibleContent(result.content);
    updateVisibleCharacterCount(result.content, result.nonWhitespaceDelta);
    await nextTick();
    const input = options.editorInput.value;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(result.start, result.end, "forward");
    options.scrollEditorToRange(input, result.start);
  }

  function undo(): void {
    if (!canUndo.value) return;
    pendingEditorInput = null;
    const result = textHistory.undo(options.currentVisibleContent.value);
    notifyHistoryChanged();
    if (result) void restoreEditorHistory(result);
  }

  function redo(): void {
    if (!canRedo.value) return;
    pendingEditorInput = null;
    const result = textHistory.redo(options.currentVisibleContent.value);
    notifyHistoryChanged();
    if (result) void restoreEditorHistory(result);
  }

  return {
    textHistory,
    historyVersion,
    canUndo,
    canRedo,
    resetEditorHistory,
    notifyHistoryChanged,
    handleEditorBeforeInput,
    handleEditorInput,
    handleEditorCompositionStart,
    handleEditorCompositionEnd,
    recordProgrammaticChange,
    updateVisibleCharacterCount,
    restoreEditorHistory,
    undo,
    redo,
    updateCurrentContent,
    getEditorSelection
  };
}
