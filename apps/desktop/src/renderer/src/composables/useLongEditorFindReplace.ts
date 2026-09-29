import { createScopedTranslator } from "../i18n";
import type { TextViewMode } from "@deepwrite/contracts";
import { computed, nextTick, ref, type ComputedRef, type Ref } from "vue";
import { uiMessage } from "../ui-feedback";
import type { TextSelectionRange } from "../utils/boundedTextHistory";

const t = createScopedTranslator("workspace.longEditorFindReplace");

export interface LongEditorSearchMatch {
  start: number;
  end: number;
}

export function useLongEditorFindReplace(options: {
  currentVisibleContent: ComputedRef<string>;
  currentReadOnly: ComputedRef<boolean>;
  canUseTextTools: ComputedRef<boolean>;
  viewMode: Ref<TextViewMode>;
  editorInput: Ref<HTMLTextAreaElement | null>;
  editorToolsElement: Ref<HTMLElement | undefined>;
  updateVisibleContent: (content: string) => void;
  updateVisibleCharacterCount: (
    nextContent: string,
    nonWhitespaceDelta?: number
  ) => void;
  recordProgrammaticChange: (
    nextContent: string,
    selectionAfter: TextSelectionRange
  ) => number | undefined;
  undo: () => void;
  redo: () => void;
  closeStoryPlotActionMenu: () => void;
  storyPlotActionMenuId: Ref<string | null>;
}): {
  findPanelElement: Ref<HTMLElement | null>;
  findInput: Ref<HTMLInputElement | null>;
  findPanelOpen: Ref<boolean>;
  findPanelMode: Ref<"find" | "replace">;
  searchQuery: Ref<string>;
  replacementText: Ref<string>;
  currentMatchIndex: Ref<number>;
  searchMatches: ComputedRef<LongEditorSearchMatch[]>;
  searchResultLabel: ComputedRef<string>;
  closeFindPanel: () => void;
  toggleFindPanel: (mode: "find" | "replace") => Promise<void>;
  findMatch: (direction: 1 | -1, quiet?: boolean) => void;
  handleFindInput: () => void;
  replaceCurrentMatch: () => void;
  replaceAllMatches: () => void;
  handleEditorKeydown: (event: KeyboardEvent) => void;
  handleWindowPointerDown: (event: PointerEvent) => void;
  scrollEditorToRange: (input: HTMLTextAreaElement, start: number) => void;
} {
  const findPanelElement = ref<HTMLElement | null>(null);
  const findInput = ref<HTMLInputElement | null>(null);
  const findPanelOpen = ref(false);
  const findPanelMode = ref<"find" | "replace">("find");
  const searchQuery = ref("");
  const replacementText = ref("");
  const currentMatchIndex = ref(-1);
  const searchAnchor = ref(0);

  const searchMatches = computed<LongEditorSearchMatch[]>(() => {
    const content = options.currentVisibleContent.value;
    const query = searchQuery.value;
    if (!query) return [];

    const matches: LongEditorSearchMatch[] = [];
    let start = 0;
    while (start <= content.length - query.length) {
      const index = content.indexOf(query, start);
      if (index < 0) break;
      matches.push({ start: index, end: index + query.length });
      start = index + query.length;
    }
    return matches;
  });
  const searchResultLabel = computed(() => {
    if (!searchQuery.value) return "0/0";
    if (!searchMatches.value.length) return t("noResults");
    const current =
      currentMatchIndex.value >= 0 ? currentMatchIndex.value + 1 : 0;
    return `${current}/${searchMatches.value.length}`;
  });

  function closeFindPanel(): void {
    findPanelOpen.value = false;
    currentMatchIndex.value = -1;
  }

  async function toggleFindPanel(mode: "find" | "replace"): Promise<void> {
    if (!options.canUseTextTools.value) return;
    if (findPanelOpen.value && findPanelMode.value === mode) {
      closeFindPanel();
      return;
    }
    options.viewMode.value = "edit";
    findPanelMode.value = mode;
    findPanelOpen.value = true;
    searchAnchor.value = options.editorInput.value?.selectionStart ?? 0;
    currentMatchIndex.value = -1;
    await nextTick();
    findInput.value?.focus({ preventScroll: true });
    findInput.value?.select();
  }

  function resolveInitialMatchIndex(direction: 1 | -1): number {
    const matches = searchMatches.value;
    if (!matches.length) return -1;
    if (direction === 1) {
      const index = matches.findIndex(
        (match) => match.start >= searchAnchor.value
      );
      return index >= 0 ? index : 0;
    }
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      if (matches[index]!.end <= searchAnchor.value) return index;
    }
    return matches.length - 1;
  }

  function scrollEditorToRange(
    input: HTMLTextAreaElement,
    start: number
  ): void {
    const line = options.currentVisibleContent.value
      .slice(0, start)
      .split("\n").length;
    const computedStyle = globalThis.getComputedStyle(input);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight);
    const resolvedLineHeight = Number.isFinite(lineHeight)
      ? lineHeight
      : Number.parseFloat(computedStyle.fontSize) * 1.95;
    input.scrollTop = Math.max(
      0,
      (line - 1) * resolvedLineHeight - input.clientHeight / 3
    );
  }

  async function selectSearchMatch(index: number): Promise<void> {
    const match = searchMatches.value[index];
    if (!match) return;
    currentMatchIndex.value = index;
    options.viewMode.value = "edit";
    await nextTick();
    const input = options.editorInput.value;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(match.start, match.end, "forward");
    scrollEditorToRange(input, match.start);
    await nextTick();
    findInput.value?.focus({ preventScroll: true });
  }

  function findMatch(direction: 1 | -1, quiet = false): void {
    if (!searchQuery.value) {
      if (!quiet) uiMessage.info(t("enterTextToFind"));
      return;
    }
    if (!searchMatches.value.length) {
      currentMatchIndex.value = -1;
      if (!quiet) uiMessage.info(t("noMatchingTextFound"));
      return;
    }
    const nextIndex =
      currentMatchIndex.value < 0
        ? resolveInitialMatchIndex(direction)
        : (currentMatchIndex.value + direction + searchMatches.value.length) %
          searchMatches.value.length;
    void selectSearchMatch(nextIndex);
  }

  function handleFindInput(): void {
    currentMatchIndex.value = -1;
    if (searchQuery.value) findMatch(1, true);
  }

  function replaceCurrentMatch(): void {
    if (options.currentReadOnly.value) return;
    const index =
      currentMatchIndex.value >= 0
        ? currentMatchIndex.value
        : resolveInitialMatchIndex(1);
    const match = searchMatches.value[index];
    if (!match) {
      uiMessage.info(
        searchQuery.value ? t("noTextToReplace") : t("enterTextToReplace")
      );
      return;
    }
    const content = options.currentVisibleContent.value;
    const nextContent =
      content.slice(0, match.start) +
      replacementText.value +
      content.slice(match.end);
    if (nextContent === content) {
      findMatch(1);
      return;
    }
    const nonWhitespaceDelta = options.recordProgrammaticChange(nextContent, {
      start: match.start + replacementText.value.length,
      end: match.start + replacementText.value.length
    });
    options.updateVisibleContent(nextContent);
    options.updateVisibleCharacterCount(nextContent, nonWhitespaceDelta);
    searchAnchor.value = match.start + replacementText.value.length;
    void nextTick(() => findMatch(1, true));
  }

  function replaceAllMatches(): void {
    if (options.currentReadOnly.value) return;
    const matches = searchMatches.value;
    if (!searchQuery.value || !matches.length) {
      uiMessage.info(
        searchQuery.value ? t("noTextToReplace") : t("enterTextToReplace")
      );
      return;
    }
    const content = options.currentVisibleContent.value;
    let cursor = 0;
    let nextContent = "";
    for (const match of matches) {
      nextContent += content.slice(cursor, match.start) + replacementText.value;
      cursor = match.end;
    }
    nextContent += content.slice(cursor);
    if (nextContent === content) {
      uiMessage.info(t("findAndReplacementTextAreTheSame"));
      return;
    }
    const nonWhitespaceDelta = options.recordProgrammaticChange(nextContent, {
      start: 0,
      end: 0
    });
    options.updateVisibleContent(nextContent);
    options.updateVisibleCharacterCount(nextContent, nonWhitespaceDelta);
    searchAnchor.value = 0;
    uiMessage.success(
      t("replacedMatches", {
        length: matches.length
      })
    );
  }

  function handleEditorKeydown(event: KeyboardEvent): void {
    const modifier = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (modifier && key === "z") {
      event.preventDefault();
      if (event.shiftKey) options.redo();
      else options.undo();
      return;
    }
    if (event.ctrlKey && !event.metaKey && key === "y") {
      event.preventDefault();
      options.redo();
      return;
    }
    if (modifier && key === "f" && !(event.metaKey && event.altKey)) {
      event.preventDefault();
      void toggleFindPanel("find");
      return;
    }
    if (
      (event.ctrlKey && !event.metaKey && key === "h") ||
      (event.metaKey && event.altKey && key === "f")
    ) {
      event.preventDefault();
      void toggleFindPanel("replace");
    }
  }

  function handleWindowPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (
      !options.editorToolsElement.value?.contains(target) &&
      !findPanelElement.value?.contains(target)
    ) {
      closeFindPanel();
    }
    if (
      options.storyPlotActionMenuId.value &&
      (!(target instanceof Element) ||
        !target.closest(".long-story-plot-card-actions"))
    ) {
      options.closeStoryPlotActionMenu();
    }
  }

  return {
    findPanelElement,
    findInput,
    findPanelOpen,
    findPanelMode,
    searchQuery,
    replacementText,
    currentMatchIndex,
    searchMatches,
    searchResultLabel,
    closeFindPanel,
    toggleFindPanel,
    findMatch,
    handleFindInput,
    replaceCurrentMatch,
    replaceAllMatches,
    handleEditorKeydown,
    handleWindowPointerDown,
    scrollEditorToRange
  };
}
