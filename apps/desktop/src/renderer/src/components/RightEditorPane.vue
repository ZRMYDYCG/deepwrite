<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onBeforeUpdate,
  onMounted,
  onUpdated,
  ref,
  watch
} from "vue";
import {
  CATALOG_LIBRARY_ENTRY_MAX_CHARACTERS,
  CATALOG_LIBRARY_OVERVIEW_MAX_CHARACTERS,
  type TextViewMode
} from "@deepwrite/contracts";
import type {
  EditorTextReference,
  EditorTextReferenceNavigation
} from "../types/conversation";
import type { EditorEntrySearchSource } from "../types/editorEntrySearch";
import type { EditorDraftState, WorkspaceDocument } from "../types/workspace";
import { resolveEditorTextReferenceRange } from "../utils/editorTextReferences";
import {
  editorScrollMemoryKey,
  rememberEditorScrollPosition,
  type EditorScrollView
} from "../utils/editorScrollMemory";
import {
  countNonWhitespaceCharacters,
  createBoundedTextHistory,
  type TextHistoryRestoreResult,
  type TextSelectionRange
} from "../utils/boundedTextHistory";
import { handleHorizontalOverflowWheel } from "../utils/horizontalOverflow";
import {
  resolveWorkspaceDocumentTitle,
  workspaceDocumentHasFixedTitle
} from "../utils/fixedWorkspaceDocumentTitle";
import { createTransientScrollbarController } from "../utils/transientScrollbar";
import { uiMessage } from "../ui-feedback";
import { useEditorSelectionInsertion } from "../composables/useEditorSelectionInsertion";
import { useEditorSaveViewport } from "../composables/useEditorSaveViewport";
import {
  useEditorComposition,
  type EditorCompositionChange
} from "../composables/useEditorComposition";
import { useLongEditorScrollMemory } from "../composables/useLongEditorScrollMemory";
import {
  searchLocalEditorEntries,
  useEditorEntrySearch
} from "../composables/useEditorEntrySearch";
import { useTextViewMode } from "../composables/useTextViewMode";
import AppIcon from "./AppIcon.vue";
import EditorTextTools from "./EditorTextTools.vue";
import { useBodyTextFormatting } from "../composables/useBodyTextFormatting";
import { catalogBodyTextKind } from "../utils/bodyTextTarget";
import EditorPaneToggle from "./EditorPaneToggle.vue";
import CatalogEditorFooterMeta from "./CatalogEditorFooterMeta.vue";
import EditorDocumentMetadata from "./EditorDocumentMetadata.vue";
import EditorSearchHighlight from "./EditorSearchHighlight.vue";
import MarkdownContent from "./MarkdownContent.vue";
import PreviewOutlinePopover from "./PreviewOutlinePopover.vue";

const t = createScopedTranslator("components.rightEditorPane");

const EditorFindReplacePanel = defineAsyncComponent(
  () => import("./EditorFindReplacePanel.vue")
);

const props = defineProps<{
  document: WorkspaceDocument;
  resourceId: string;
  draftState: EditorDraftState | undefined;
  locateReference?: EditorTextReferenceNavigation | undefined;
  locked: boolean;
  lockedLabel?: string | undefined;
  saving?: boolean;
  manualSaving?: boolean;
  formatAllPending?: boolean;
  autoSaveEnabled?: boolean;
  defaultViewMode: TextViewMode;
  boundToCurrentBook?: boolean;
  sectionTabs?: readonly { id: string; title: string }[];
  activeSectionId?: string | undefined;
  sectionTabsLabel?: string | undefined;
  canCreateSection?: boolean;
  createSectionLabel?: string | undefined;
  showDeleteSection?: boolean;
  canDeleteSection?: boolean;
  deleteSectionLabel?: string | undefined;
  rightPane?: boolean;
  rightPaneCollapsed?: boolean;
  entrySearchItems: readonly EditorEntrySearchSource[];
}>();

const emit = defineEmits<{
  collapse: [];
  toggleRight: [];
  save: [payload: { id: string; title: string; content: string }];
  liveChange: [payload: { id: string; title: string; content: string }];
  compositionChange: [change: EditorCompositionChange];
  formatAllBodies: [];
  insertSelection: [reference: EditorTextReference];
  selectSection: [sectionId: string];
  createSection: [];
  deleteSection: [];
  selectDraftFile: [fileKind: "body" | "character-state"];
  selectEntrySearchResult: [documentId: string];
  prepareEntrySearch: [];
}>();

const editorInput = ref<HTMLTextAreaElement>();
let composingDocumentId: string | undefined;
const editorComposition = useEditorComposition({
  onChange(composing) {
    if (composing) composingDocumentId = props.document.id;
    if (composingDocumentId) {
      emit("compositionChange", { id: composingDocumentId, composing });
    }
    if (!composing) composingDocumentId = undefined;
  }
});
const documentPreview = ref<HTMLElement | null>(null);
const editorToolsElement = ref<HTMLElement>();
const findPanelElement = ref<HTMLElement | null>(null);
const findInput = ref<HTMLInputElement | null>(null);
const title = ref(
  resolveWorkspaceDocumentTitle(props.document, props.draftState?.title)
);
const content = ref(props.draftState?.content ?? props.document.content);
const nonWhitespaceCharacterCount = ref(
  countNonWhitespaceCharacters(content.value)
);
const dirty = ref(props.draftState?.dirty ?? false);
const {
  closeSelectionAction,
  handleEditorContextMenu,
  handlePreviewContextMenu
} = useEditorSelectionInsertion({
  history: {
    canUndo: () => canUndo.value,
    canRedo: () => canRedo.value,
    undo: () => undo(),
    redo: () => redo()
  },
  source: () => ({
    resourceId: props.resourceId,
    document: {
      ...props.document,
      title: title.value,
      content: content.value
    }
  }),
  insert: (reference) => emit("insertSelection", reference)
});
const { resetToDefault, setViewMode, viewMode } = useTextViewMode({
  defaultMode: () => props.defaultViewMode
});
const findPanelOpen = ref(false);
const findPanelMode = ref<"find" | "replace">("find");
const searchQuery = ref("");
const replacementText = ref("");
const currentMatchIndex = ref(-1);
const searchAnchor = ref(0);
const entrySearch = useEditorEntrySearch({
  search: (query) => searchLocalEditorEntries(props.entrySearchItems, query),
  navigate: ({ id }) => emit("selectEntrySearchResult", id)
});
const {
  query: entrySearchQuery,
  results: entrySearchResults,
  activeIndex: activeEntrySearchIndex,
  pending: entrySearchPending,
  resultLabel: entrySearchResultLabel,
  handleInput: handleEntrySearchInput,
  moveActive: moveActiveEntrySearchResult,
  selectResult: selectEntrySearchResult,
  reset: resetEntrySearch
} = entrySearch;

interface EditorSearchMatch {
  start: number;
  end: number;
}

const textHistory = createBoundedTextHistory();
const historyVersion = ref(0);
let pendingEditorInput: {
  selectionBefore: TextSelectionRange;
  inputType: string;
  timestamp: number;
} | null = null;
const activeScrollMemoryKey = computed(() =>
  editorScrollMemoryKey(props.document)
);
const {
  handleScroll: rememberDocumentScrollEvent,
  rememberScroll: rememberCurrentDocumentScroll,
  restoreScroll: restoreDocumentScroll
} = useLongEditorScrollMemory({
  documentKey: () => activeScrollMemoryKey.value,
  viewMode,
  editorInput,
  documentPreview,
  // This pane remembers the previous section, resets its view mode, then
  // restores the next section. The shared watcher would run in between and
  // store the previous offset on the next document.
  bindIdentityWatch: false
});
const documentScrollbar = createTransientScrollbarController();
const {
  captureBeforeRender: captureEditorViewportBeforeRender,
  preserveForDispatchedSave: preserveEditorViewportForSave,
  restoreAfterRender: restoreEditorViewportAfterRender
} = useEditorSaveViewport({
  editorInput,
  documentKey: activeScrollMemoryKey,
  isEditView: () => viewMode.value === "edit",
  isSaving: () => Boolean(props.saving),
  isComposing: () => editorComposition.isComposing.value,
  isTransientlyReadOnly: () => props.locked,
  rememberScroll: (documentKey, scrollTop) =>
    rememberEditorScrollPosition(documentKey, "edit", scrollTop)
});

onBeforeUpdate(captureEditorViewportBeforeRender);
onUpdated(restoreEditorViewportAfterRender);

watch(activeScrollMemoryKey, (nextScrollMemoryKey, previousScrollMemoryKey) => {
  editorComposition.reset();
  rememberCurrentDocumentScroll(previousScrollMemoryKey);
  title.value = resolveWorkspaceDocumentTitle(
    props.document,
    props.draftState?.title
  );
  content.value = props.draftState?.content ?? props.document.content;
  nonWhitespaceCharacterCount.value = countNonWhitespaceCharacters(
    content.value
  );
  dirty.value = props.draftState?.dirty ?? false;
  const nextViewMode = resetToDefault();
  closeSelectionAction();
  findPanelOpen.value = false;
  searchQuery.value = "";
  replacementText.value = "";
  currentMatchIndex.value = -1;
  resetEntrySearch();
  resetEditorHistory();
  void restoreDocumentScroll(nextScrollMemoryKey, nextViewMode);
});

watch(
  () =>
    [
      props.draftState?.title,
      props.draftState?.content,
      props.draftState?.dirty,
      props.document.title,
      props.document.content
    ] as const,
  ([nextTitle, nextContent, nextDirty, documentTitle, documentContent]) => {
    const resolvedTitle = resolveWorkspaceDocumentTitle(
      props.document,
      nextTitle ?? documentTitle
    );
    const resolvedContent = nextContent ?? documentContent;
    if (title.value !== resolvedTitle) title.value = resolvedTitle;
    if (content.value !== resolvedContent) {
      content.value = resolvedContent;
      nonWhitespaceCharacterCount.value =
        countNonWhitespaceCharacters(resolvedContent);
      resetEditorHistory();
    }
    dirty.value = nextDirty ?? false;
  }
);

const isLibraryEntry = computed(
  () =>
    (props.document.domain === "material" ||
      props.document.domain === "skill") &&
    Boolean(props.document.catalogEntryId)
);
const isLibraryOverview = computed(
  () => props.document.catalogLibraryField === "overview"
);
const isTitleReadOnly = computed(
  () =>
    props.document.readOnly ||
    props.locked ||
    workspaceDocumentHasFixedTitle(props.document)
);
const isLibraryDocument = computed(
  () => isLibraryEntry.value || isLibraryOverview.value
);
const recommendedContentLength = computed(() =>
  isLibraryOverview.value
    ? CATALOG_LIBRARY_OVERVIEW_MAX_CHARACTERS
    : isLibraryEntry.value
      ? CATALOG_LIBRARY_ENTRY_MAX_CHARACTERS
      : undefined
);
const contentExceedsRecommendedLength = computed(
  () =>
    recommendedContentLength.value !== undefined &&
    content.value.length > recommendedContentLength.value
);
const characterCount = computed(() =>
  isLibraryDocument.value
    ? content.value.length
    : nonWhitespaceCharacterCount.value
);
const showSectionTabs = computed(() => Boolean(props.sectionTabs?.length));
const showDraftFileTabs = computed(() => Boolean(props.document.draftFileKind));
const editorReadOnly = computed(() => props.document.readOnly || props.locked);
const canUndo = computed(() => {
  void historyVersion.value;
  return !editorReadOnly.value && textHistory.canUndo;
});
const canRedo = computed(() => {
  void historyVersion.value;
  return !editorReadOnly.value && textHistory.canRedo;
});
const searchMatches = computed<EditorSearchMatch[]>(() => {
  const query = searchQuery.value;
  if (!query) return [];

  const matches: EditorSearchMatch[] = [];
  let start = 0;
  while (start <= content.value.length - query.length) {
    const index = content.value.indexOf(query, start);
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
const draftUnitLabel = computed(() =>
  props.document.workspaceType === "script" ? t("episode") : t("section")
);
const resolvedSectionTabsLabel = computed(
  () =>
    props.sectionTabsLabel ??
    t("manuscriptValue", {
      arg0: draftUnitLabel.value
    })
);
const resolvedCreateSectionLabel = computed(
  () => props.createSectionLabel ?? t("addASectionAtTheEndOfTheManuscript")
);
const resolvedDeleteSectionLabel = computed(
  () => props.deleteSectionLabel ?? t("deleteCurrentEntry")
);

function markDirty(): void {
  if (
    props.document.readOnly ||
    props.locked ||
    editorComposition.isComposing.value
  )
    return;
  dirty.value = true;
  emit("liveChange", {
    id: props.document.id,
    title: title.value,
    content: content.value
  });
}

const {
  visible: bodyFormatVisible,
  disabled: bodyFormatDisabled,
  format: formatBody
} = useBodyTextFormatting({
  kind: () => catalogBodyTextKind(props.document),
  content: () => content.value,
  disabled: () =>
    editorReadOnly.value ||
    Boolean(props.saving || props.manualSaving) ||
    props.document.catalogContentLoaded === false,
  documentKey: () => activeScrollMemoryKey.value,
  editorInput: () => editorInput.value,
  recordChange: recordProgrammaticChange,
  updateContent
});

function handleFormatBody(): void {
  if (bodyFormatDisabled.value || props.formatAllPending) return;
  if (catalogBodyTextKind(props.document)) {
    emit("formatAllBodies");
    return;
  }
  void formatBody();
}

function applyLibraryMetadata(nextContent: string): void {
  if (editorReadOnly.value) return;
  const delta = recordProgrammaticChange(nextContent, { start: 0, end: 0 });
  updateContent(nextContent, delta);
}

function getEditorSelection(
  fallback = content.value.length
): TextSelectionRange {
  const input = editorInput.value;
  return {
    start: input?.selectionStart ?? fallback,
    end: input?.selectionEnd ?? fallback
  };
}

function notifyHistoryChanged(): void {
  historyVersion.value += 1;
}

function resetEditorHistory(): void {
  pendingEditorInput = null;
  textHistory.clear();
  notifyHistoryChanged();
}

function handleEditorBeforeInput(event: InputEvent): void {
  if (editorReadOnly.value || editorComposition.isComposingInput(event)) return;
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
      start: input.selectionStart ?? content.value.length,
      end: input.selectionEnd ?? content.value.length
    },
    inputType: event.inputType,
    timestamp: event.timeStamp
  };
}

function handleEditorInput(event: Event): void {
  if (editorReadOnly.value || editorComposition.isComposingInput(event)) return;
  const input = event.currentTarget as HTMLTextAreaElement;
  const beforeContent = content.value;
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
  updateContent(afterContent, historyResult?.nonWhitespaceDelta);
}

function handleEditorCompositionStart(event: CompositionEvent): void {
  if (editorReadOnly.value) return;
  const input = event.currentTarget as HTMLTextAreaElement;
  pendingEditorInput = {
    selectionBefore: { start: input.selectionStart, end: input.selectionEnd },
    inputType: "",
    timestamp: event.timeStamp
  };
  editorComposition.start();
}

function handleEditorCompositionEnd(event: CompositionEvent): void {
  editorComposition.finish(() => handleEditorInput(event));
}

function handleTitleCompositionEnd(event: CompositionEvent): void {
  editorComposition.finish(() => {
    title.value = (event.currentTarget as HTMLInputElement).value;
    markDirty();
  });
}

function updateContent(
  nextContent: string,
  nonWhitespaceDelta?: number
): boolean {
  if (content.value === nextContent) return true;
  content.value = nextContent;
  nonWhitespaceCharacterCount.value =
    nonWhitespaceDelta === undefined
      ? countNonWhitespaceCharacters(nextContent)
      : Math.max(0, nonWhitespaceCharacterCount.value + nonWhitespaceDelta);
  currentMatchIndex.value = -1;
  markDirty();
  return true;
}

function recordProgrammaticChange(
  nextContent: string,
  selectionAfter: TextSelectionRange
): number | undefined {
  const result = textHistory.recordChange({
    beforeContent: content.value,
    afterContent: nextContent,
    selectionBefore: getEditorSelection(),
    selectionAfter
  });
  if (result) {
    notifyHistoryChanged();
  }
  return result?.nonWhitespaceDelta;
}

async function restoreEditorHistory(
  result: TextHistoryRestoreResult
): Promise<void> {
  setViewMode("edit");
  updateContent(result.content, result.nonWhitespaceDelta);
  await nextTick();
  const input = editorInput.value;
  if (!input) return;
  input.focus({ preventScroll: true });
  input.setSelectionRange(result.start, result.end, "forward");
  scrollEditorToRange(input, result.start);
}

function undo(): void {
  if (!canUndo.value) return;
  pendingEditorInput = null;
  const result = textHistory.undo(content.value);
  notifyHistoryChanged();
  if (result) void restoreEditorHistory(result);
}

function redo(): void {
  if (!canRedo.value) return;
  pendingEditorInput = null;
  const result = textHistory.redo(content.value);
  notifyHistoryChanged();
  if (result) void restoreEditorHistory(result);
}

function handleEditorKeydown(event: KeyboardEvent): void {
  if (event.isComposing || editorComposition.isComposing.value) return;
  const modifier = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();

  if (modifier && key === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }
  if (event.ctrlKey && !event.metaKey && key === "y") {
    event.preventDefault();
    redo();
    return;
  }
  if (modifier && key === "f" && !(event.metaKey && event.altKey)) {
    event.preventDefault();
    toggleFindPanel("find");
    return;
  }
  if (
    (event.ctrlKey && !event.metaKey && key === "h") ||
    (event.metaKey && event.altKey && key === "f")
  ) {
    event.preventDefault();
    toggleFindPanel("replace");
  }
}

function save(): void {
  if (
    props.document.readOnly ||
    props.locked ||
    props.saving ||
    editorComposition.isComposing.value
  ) {
    return;
  }
  const resolvedTitle = resolveWorkspaceDocumentTitle(
    props.document,
    title.value
  );
  if (!resolvedTitle.trim()) {
    uiMessage.warning(t("enterADocumentTitleBeforeSaving"));
    return;
  }
  preserveEditorViewportForSave();
  emit("save", {
    id: props.document.id,
    title: resolvedTitle,
    content: content.value
  });
}

function handleDocumentScroll(event: Event): void {
  const scroller = event.currentTarget;
  if (!(scroller instanceof HTMLElement)) return;
  documentScrollbar.reveal(scroller);
  rememberDocumentScrollEvent(event);
  closeSelectionAction();
}

function selectViewMode(view: EditorScrollView): void {
  if (view === viewMode.value) return;
  rememberCurrentDocumentScroll();
  setViewMode(view);
  closeSelectionAction();
  void restoreDocumentScroll(activeScrollMemoryKey.value, view);
}

watch(
  () => props.defaultViewMode,
  (mode) => selectViewMode(mode)
);

watch(
  () => props.entrySearchItems,
  () => {
    if (entrySearchQuery.value.trim()) handleEntrySearchInput();
  }
);

function closeFindPanel(): void {
  findPanelOpen.value = false;
  currentMatchIndex.value = -1;
}

async function toggleFindPanel(mode: "find" | "replace"): Promise<void> {
  if (findPanelOpen.value && findPanelMode.value === mode) {
    closeFindPanel();
    return;
  }

  setViewMode("edit");
  closeSelectionAction();
  findPanelMode.value = mode;
  findPanelOpen.value = true;
  emit("prepareEntrySearch");
  searchAnchor.value = editorInput.value?.selectionStart ?? 0;
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

function scrollEditorToRange(input: HTMLTextAreaElement, start: number): void {
  const line = content.value.slice(0, start).split("\n").length;
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
  setViewMode("edit");
  await nextTick();
  const input = editorInput.value;
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
    if (!quiet) uiMessage.info(t("noMatchingText"));
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
  if (editorReadOnly.value) return;
  const index =
    currentMatchIndex.value >= 0
      ? currentMatchIndex.value
      : resolveInitialMatchIndex(1);
  const match = searchMatches.value[index];
  if (!match) {
    uiMessage.info(
      searchQuery.value
        ? t("noTextAvailableToReplace")
        : t("enterTextToReplace")
    );
    return;
  }

  const nextContent =
    content.value.slice(0, match.start) +
    replacementText.value +
    content.value.slice(match.end);
  if (nextContent === content.value) {
    findMatch(1);
    return;
  }

  const nonWhitespaceDelta = recordProgrammaticChange(nextContent, {
    start: match.start + replacementText.value.length,
    end: match.start + replacementText.value.length
  });
  updateContent(nextContent, nonWhitespaceDelta);
  searchAnchor.value = match.start + replacementText.value.length;
  void nextTick(() => findMatch(1, true));
}

function replaceAllMatches(): void {
  if (editorReadOnly.value) return;
  const matches = searchMatches.value;
  if (!searchQuery.value || !matches.length) {
    uiMessage.info(
      searchQuery.value
        ? t("noTextAvailableToReplace")
        : t("enterTextToReplace")
    );
    return;
  }

  let cursor = 0;
  let nextContent = "";
  for (const match of matches) {
    nextContent +=
      content.value.slice(cursor, match.start) + replacementText.value;
    cursor = match.end;
  }
  nextContent += content.value.slice(cursor);

  if (nextContent === content.value) {
    uiMessage.info(t("findAndReplacementTextAreIdentical"));
    return;
  }
  const nonWhitespaceDelta = recordProgrammaticChange(nextContent, {
    start: 0,
    end: 0
  });
  updateContent(nextContent, nonWhitespaceDelta);
  searchAnchor.value = 0;
  uiMessage.success(
    t("replacedValueOccurrences", {
      arg0: matches.length
    })
  );
}

function handleWindowPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (
    !editorToolsElement.value?.contains(target) &&
    !findPanelElement.value?.contains(target)
  ) {
    closeFindPanel();
  }
}

async function locateEditorReference(
  navigation: EditorTextReferenceNavigation | undefined
): Promise<void> {
  if (!navigation || navigation.reference.documentId !== props.document.id)
    return;
  setViewMode("edit");
  closeSelectionAction();
  await nextTick();
  const input = editorInput.value;
  if (!input) return;
  const range = resolveEditorTextReferenceRange(
    content.value,
    navigation.reference
  );
  input.focus();
  input.setSelectionRange(range.start, range.end, "forward");
  scrollEditorToRange(input, range.start);
}

watch(
  () => [props.locateReference?.requestId, props.document.id] as const,
  () => {
    void locateEditorReference(props.locateReference);
  },
  { flush: "post" }
);

onMounted(() => {
  globalThis.addEventListener("pointerdown", handleWindowPointerDown, true);
  void restoreDocumentScroll();
});

onBeforeUnmount(() => {
  editorComposition.reset();
  rememberCurrentDocumentScroll();
  documentScrollbar.dispose();
  globalThis.removeEventListener("pointerdown", handleWindowPointerDown, true);
});
</script>

<template>
  <aside
    class="editor-pane"
    :class="{
      'has-section-tabs': showSectionTabs,
      'is-script-workspace': document.workspaceType === 'script'
    }"
    :data-workspace-type="document.workspaceType"
    :aria-label="t('textContent')"
  >
    <nav
      v-if="showSectionTabs"
      class="section-tabs-bar"
      :aria-label="resolvedSectionTabsLabel"
    >
      <div
        class="section-tabs-scroll"
        role="tablist"
        @wheel="handleHorizontalOverflowWheel"
      >
        <button
          v-for="section in sectionTabs ?? []"
          :key="section.id"
          class="section-tab"
          :class="{ 'is-active': section.id === activeSectionId }"
          type="button"
          role="tab"
          :aria-selected="section.id === activeSectionId"
          :title="section.title"
          @click="emit('selectSection', section.id)"
        >
          {{ section.title }}
        </button>
      </div>
      <button
        v-if="canCreateSection"
        class="section-tabs-add"
        type="button"
        :aria-label="resolvedCreateSectionLabel"
        :title="resolvedCreateSectionLabel"
        :disabled="locked"
        @click="emit('createSection')"
      >
        <AppIcon name="plus" :size="16" />
      </button>
      <button
        v-if="showDeleteSection"
        class="section-tabs-remove"
        type="button"
        :aria-label="resolvedDeleteSectionLabel"
        :title="resolvedDeleteSectionLabel"
        :disabled="locked || !canDeleteSection"
        @click="emit('deleteSection')"
      >
        <AppIcon name="minus" :size="16" />
      </button>
    </nav>

    <div class="editor-toolbar">
      <div
        v-if="showDraftFileTabs"
        class="draft-file-tabs"
        role="tablist"
        :aria-label="t('valueFile', { arg0: draftUnitLabel })"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="document.draftFileKind === 'body'"
          :class="{ 'is-active': document.draftFileKind === 'body' }"
          @click="emit('selectDraftFile', 'body')"
        >
          {{ t("manuscript") }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="document.draftFileKind === 'character-state'"
          :class="{ 'is-active': document.draftFileKind === 'character-state' }"
          @click="emit('selectDraftFile', 'character-state')"
        >
          {{ t("characterState") }}
        </button>
      </div>
      <span v-if="showDraftFileTabs" class="toolbar-separator" />
      <div class="view-tabs" role="tablist" :aria-label="t('textView')">
        <button
          type="button"
          role="tab"
          :aria-selected="viewMode === 'edit'"
          :class="{ 'is-active': viewMode === 'edit' }"
          @click="selectViewMode('edit')"
        >
          {{ t("edit") }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="viewMode === 'preview'"
          :class="{ 'is-active': viewMode === 'preview' }"
          @click="selectViewMode('preview')"
        >
          {{ t("preview") }}
        </button>
      </div>
      <span class="toolbar-separator" />
      <div
        ref="editorToolsElement"
        class="editor-text-tools"
        role="group"
        :aria-label="t('textActions')"
      >
        <EditorTextTools
          :can-undo="canUndo"
          :can-redo="canRedo"
          :find-panel-open="findPanelOpen"
          :find-panel-mode="findPanelMode"
          :format-visible="bodyFormatVisible"
          :format-disabled="bodyFormatDisabled || formatAllPending"
          :format-label="
            document.workspaceType === 'short' ||
            document.workspaceType === 'script'
              ? t('formatAllManuscriptBodies')
              : undefined
          "
          @undo="undo"
          @redo="redo"
          @toggle-find="toggleFindPanel"
          @format="handleFormatBody"
        />
        <PreviewOutlinePopover
          v-if="viewMode === 'preview'"
          icon-only
          :content="content"
          :preview-element="documentPreview"
          :document-key="activeScrollMemoryKey"
        />
      </div>

      <EditorPaneToggle
        :right-pane="rightPane"
        :right-pane-collapsed="rightPaneCollapsed"
        @collapse="emit('collapse')"
        @toggle-right="emit('toggleRight')"
      />

      <EditorFindReplacePanel
        v-if="findPanelOpen"
        v-model:find-panel-element="findPanelElement"
        v-model:find-input="findInput"
        v-model:search-query="searchQuery"
        v-model:replacement-text="replacementText"
        v-model:entry-search-query="entrySearchQuery"
        :find-panel-mode="findPanelMode"
        :search-result-label="searchResultLabel"
        :current-read-only="editorReadOnly"
        :entry-search-results="entrySearchResults"
        :active-entry-search-index="activeEntrySearchIndex"
        :entry-search-pending="entrySearchPending"
        :entry-search-result-label="entrySearchResultLabel"
        @find-input="handleFindInput"
        @find-match="findMatch"
        @close="closeFindPanel"
        @replace-current="replaceCurrentMatch"
        @replace-all="replaceAllMatches"
        @entry-search-input="handleEntrySearchInput"
        @move-entry-search="moveActiveEntrySearchResult"
        @select-entry-search="selectEntrySearchResult"
      />
    </div>

    <div
      class="editor-document"
      :class="{
        'is-readonly': document.readOnly,
        'without-metadata': document.domain === 'creation'
      }"
    >
      <EditorDocumentMetadata
        v-if="document.domain !== 'creation'"
        :document="document"
        :title="title"
        :content="content"
        :bound-to-current-book="boundToCurrentBook"
        :locked="locked"
        @change="applyLibraryMetadata"
      />

      <input
        v-model="title"
        class="document-title-input"
        :readonly="isTitleReadOnly"
        :aria-label="t('documentTitle')"
        @input="markDirty"
        @compositionstart="editorComposition.start"
        @compositionend="handleTitleCompositionEnd"
      />

      <EditorSearchHighlight
        v-if="viewMode === 'edit'"
        :content="content"
        :matches="searchMatches"
        :active-index="currentMatchIndex"
        :visible="findPanelOpen"
      >
        <textarea
          ref="editorInput"
          :value="editorComposition.valueForRender(content, editorInput)"
          class="document-editor transient-scrollbar"
          :readonly="document.readOnly || locked"
          :aria-label="t('textEditor')"
          spellcheck="false"
          @beforeinput="handleEditorBeforeInput"
          @input="handleEditorInput"
          @compositionstart="handleEditorCompositionStart"
          @compositionend="handleEditorCompositionEnd"
          @keydown="handleEditorKeydown"
          @contextmenu="handleEditorContextMenu"
          @scroll="handleDocumentScroll"
        />
      </EditorSearchHighlight>
      <article
        v-else
        ref="documentPreview"
        class="document-preview transient-scrollbar"
        @contextmenu="handlePreviewContextMenu"
        @scroll="handleDocumentScroll"
      >
        <MarkdownContent
          v-if="content.trim()"
          :content="content"
          annotate-headings
        />
        <p v-else class="document-preview-empty">
          {{ t("noContentYet") }}
        </p>
      </article>
    </div>

    <footer
      class="editor-footer"
      :title="locked ? (lockedLabel ?? t('agentRunningReadOnly')) : undefined"
    >
      <CatalogEditorFooterMeta
        :document="document"
        :content="content"
        :character-count="characterCount"
        :recommended-content-length="recommendedContentLength"
        :is-library-document="isLibraryDocument"
        :is-library-overview="isLibraryOverview"
        :content-exceeds-recommended-length="contentExceedsRecommendedLength"
        :auto-save-enabled="autoSaveEnabled"
      />
      <button
        class="save-button"
        type="button"
        :disabled="
          document.readOnly ||
          locked ||
          manualSaving ||
          (!autoSaveEnabled && !dirty)
        "
        @mousedown.prevent
        @click="save"
      >
        <AppIcon name="save" :size="14" />
        {{
          manualSaving
            ? t("saving")
            : autoSaveEnabled
              ? t("saveNow")
              : t("apply")
        }}
      </button>
    </footer>
  </aside>
</template>
