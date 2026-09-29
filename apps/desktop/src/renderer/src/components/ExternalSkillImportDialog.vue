<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import {
  CATALOG_PROJECT_MAX_CONTENT_ITEMS,
  type CatalogLibrary,
  type ExternalLibrarySelectionResult,
  type ExternalLibrarySourceKind
} from "@deepwrite/contracts";
import { computed, ref, watch } from "vue";
import AppIcon from "./AppIcon.vue";
import PopupSelect from "./PopupSelect.vue";

const t = createScopedTranslator("components.externalSkillImportDialog");

const props = defineProps<{
  open: boolean;
  domain: "material" | "skill";
  libraries: readonly CatalogLibrary[];
  preselectedLibraryId?: string | undefined;
  selection?: ExternalLibrarySelectionResult | undefined;
  pending?: boolean | undefined;
}>();

const emit = defineEmits<{
  close: [];
  choose: [sourceKind: ExternalLibrarySourceKind];
  submit: [payload: { libraryId: string; candidateIds: string[] }];
}>();

const targetLibraryId = ref("");
const selectedCandidateIds = ref<string[]>([]);
const domainLabel = computed(() =>
  props.domain === "skill" ? t("skill") : t("material")
);
const libraryOptions = computed(() =>
  props.libraries.map((library) => ({
    value: library.id,
    label: library.title
  }))
);
const targetLibrary = computed(() =>
  props.libraries.find((library) => library.id === targetLibraryId.value)
);
const remainingCapacity = computed(
  () =>
    CATALOG_PROJECT_MAX_CONTENT_ITEMS -
    (targetLibrary.value?.entries.length ?? 0)
);
const capacityExceeded = computed(
  () => selectedCandidateIds.value.length > remainingCapacity.value
);
const skippedCount = computed(() =>
  props.selection
    ? Object.values(props.selection.skipped).reduce(
        (total, count) => total + count,
        0
      )
    : 0
);
const skippedSummary = computed(() => {
  const skipped = props.selection?.skipped;
  if (!skipped) return "";
  return [
    [t("unsupportedFormat"), skipped.unsupported],
    [t("couldNotReadOrExtract"), skipped.unreadable],
    [t("emptyContent"), skipped.empty],
    [t("fileOrContentExceedsLimit"), skipped.tooLarge],
    [t("candidateLimitExceeded"), skipped.limitExceeded]
  ]
    .filter(([, count]) => Boolean(count))
    .map(([label, count]) => `${label} ${count}`)
    .join("、");
});
const allSelected = computed(
  () =>
    Boolean(props.selection?.candidates.length) &&
    selectedCandidateIds.value.length === props.selection?.candidates.length
);

function comparableTitle(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

function uniqueTitle(sourceTitle: string, occupied: Set<string>): string {
  const base = [...sourceTitle].slice(0, 256).join("");
  if (!occupied.has(comparableTitle(base))) {
    occupied.add(comparableTitle(base));
    return base;
  }
  for (let index = 2; index < 100_000; index += 1) {
    const suffix = ` (${index})`;
    const shortened = [...base]
      .slice(0, Math.max(1, 256 - [...suffix].length))
      .join("")
      .trimEnd();
    const candidate = t("valueValue", {
      arg0: shortened || t("untitledEntry"),
      arg1: suffix
    });
    if (occupied.has(comparableTitle(candidate))) continue;
    occupied.add(comparableTitle(candidate));
    return candidate;
  }
  return base;
}

const visibleCandidates = computed(() => {
  const occupied = new Set(
    (targetLibrary.value?.entries ?? []).map((entry) =>
      comparableTitle(entry.title)
    )
  );
  return (props.selection?.candidates ?? []).map((candidate) => ({
    id: candidate.id,
    title: uniqueTitle(candidate.title, occupied)
  }));
});

function selectAll(): void {
  selectedCandidateIds.value = (props.selection?.candidates ?? []).map(
    ({ id }) => id
  );
}

function clearSelection(): void {
  selectedCandidateIds.value = [];
}

function toggleCandidate(id: string): void {
  selectedCandidateIds.value = selectedCandidateIds.value.includes(id)
    ? selectedCandidateIds.value.filter((candidateId) => candidateId !== id)
    : [...selectedCandidateIds.value, id];
}

function requestClose(): void {
  if (!props.pending) emit("close");
}

function submit(): void {
  if (
    props.pending ||
    !targetLibraryId.value ||
    selectedCandidateIds.value.length === 0 ||
    capacityExceeded.value
  ) {
    return;
  }
  emit("submit", {
    libraryId: targetLibraryId.value,
    candidateIds: [...selectedCandidateIds.value]
  });
}

watch(
  () =>
    [
      props.open,
      props.selection,
      props.preselectedLibraryId,
      props.libraries
    ] as const,
  ([open, selection, preselectedLibraryId, libraries], previous) => {
    if (!open) return;
    const preselected = libraries.some(
      (library) => library.id === preselectedLibraryId
    )
      ? (preselectedLibraryId ?? "")
      : "";
    if (!selection) {
      targetLibraryId.value = preselected;
      selectedCandidateIds.value = [];
      return;
    }
    if (
      !targetLibraryId.value ||
      !libraries.some(({ id }) => id === targetLibraryId.value)
    ) {
      targetLibraryId.value = preselected;
    }
    if (selection !== previous?.[1]) {
      selectedCandidateIds.value = selection.candidates.map(({ id }) => id);
    }
  },
  { immediate: true }
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @mousedown.self="requestClose">
      <section
        class="workspace-dialog external-library-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-library-import-title"
      >
        <header>
          <div>
            <span class="dialog-eyebrow">{{
              t("libraryFileImportMessage", { arg0: domainLabel ?? "" })
            }}</span>
            <h2 id="external-library-import-title">
              {{
                t("importFromFilesOrFoldersMessage", {
                  arg0: domainLabel ?? ""
                })
              }}
            </h2>
          </div>
          <button
            class="dialog-close"
            type="button"
            :aria-label="t('close')"
            :disabled="pending"
            @click="requestClose"
          >
            ×
          </button>
        </header>

        <div class="dialog-content">
          <template v-if="!selection">
            <p class="dialog-description">
              {{ t("supportsTXTMarkdownPDFAndWordDocumentsFoldersAre") }}
            </p>
            <div class="source-options">
              <button
                type="button"
                class="source-option"
                :disabled="pending"
                @click="emit('choose', 'directory')"
              >
                <AppIcon name="folder" :size="22" />
                <span
                  ><strong>{{ t("chooseFolder") }}</strong
                  ><small>{{
                    t("scanSupportedDocumentsRecursively")
                  }}</small></span
                >
              </button>
              <button
                type="button"
                class="source-option"
                :disabled="pending"
                @click="emit('choose', 'file')"
              >
                <AppIcon name="file" :size="22" />
                <span
                  ><strong>{{ t("chooseFiles") }}</strong
                  ><small>{{ t("selectMultipleFilesAtOnce") }}</small></span
                >
              </button>
            </div>
          </template>

          <template v-else>
            <p class="scan-summary">
              {{
                t("scannedFilesImportableEntriesMessage", {
                  arg0: selection.scanned ?? "",
                  arg1: selection.candidates.length ?? ""
                })
              }}<span v-if="skippedCount">{{
                t("skippedMessage", {
                  arg0: skippedCount ?? "",
                  arg1: skippedSummary ?? ""
                })
              }}</span
              >。
            </p>
            <label class="target-field">
              <span>{{
                t("targetLibraryMessage", {
                  arg0: domainLabel ?? ""
                })
              }}</span>
              <PopupSelect
                v-model="targetLibraryId"
                :options="libraryOptions"
                :accessible-label="
                  t('selectTargetValueLibrary', { arg0: domainLabel })
                "
                :placeholder="t('selectATargetLibrary')"
                size="large"
                :disabled="pending || libraryOptions.length === 0"
                :menu-min-width="260"
              />
            </label>
            <div class="candidate-toolbar">
              <strong>{{ t("importEntries") }}</strong>
              <span
                >{{ selectedCandidateIds.length }} /
                {{ visibleCandidates.length }}</span
              >
              <button
                type="button"
                :disabled="pending || allSelected"
                @click="selectAll"
              >
                {{ t("selectAll") }}
              </button>
              <button
                type="button"
                :disabled="pending || selectedCandidateIds.length === 0"
                @click="clearSelection"
              >
                {{ t("deselectAll") }}
              </button>
            </div>
            <div
              class="candidate-list"
              role="group"
              :aria-label="
                t('selectValueEntriesToImport', { arg0: domainLabel })
              "
            >
              <label
                v-for="candidate in visibleCandidates"
                :key="candidate.id"
                class="candidate-item"
              >
                <input
                  type="checkbox"
                  :checked="selectedCandidateIds.includes(candidate.id)"
                  :disabled="pending"
                  @change="toggleCandidate(candidate.id)"
                />
                <span>{{ candidate.title }}</span>
              </label>
              <p v-if="visibleCandidates.length === 0" class="empty-state">
                {{ t("noContentAvailableToImport") }}
              </p>
            </div>
            <p v-if="capacityExceeded" class="capacity-note">
              {{
                t("theTargetLibraryHasRoomForMoreMessage", {
                  arg0: Math.max(0, remainingCapacity) ?? ""
                })
              }}
            </p>
          </template>

          <div class="dialog-actions">
            <button
              class="dialog-secondary-button"
              type="button"
              :disabled="pending"
              @click="requestClose"
            >
              {{ t("cancel") }}
            </button>
            <button
              v-if="selection"
              class="dialog-primary-button"
              type="button"
              :disabled="
                pending ||
                !targetLibraryId ||
                selectedCandidateIds.length === 0 ||
                capacityExceeded
              "
              @click="submit"
            >
              {{
                pending
                  ? t("importing")
                  : t("importValueEntries", {
                      arg0: selectedCandidateIds.length
                    })
              }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.external-library-import-dialog {
  width: min(620px, calc(100vw - 32px));
}

.source-options {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

.source-option {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 16px;
  border: 1px solid var(--theme-line);
  border-radius: 12px;
  color: var(--text-primary);
  background: var(--surface-raised);
  text-align: left;
  cursor: pointer;
}

.source-option:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--surface-hover);
}

.source-option:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.source-option:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.source-option > span {
  display: grid;
  gap: 4px;
}

.source-option small,
.scan-summary,
.capacity-note {
  color: var(--text-secondary);
}

.target-field {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.candidate-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
}

.candidate-toolbar strong {
  margin-right: auto;
}

.candidate-toolbar button {
  border: 0;
  color: var(--accent);
  background: transparent;
  cursor: pointer;
}

.candidate-toolbar button:disabled {
  cursor: default;
  opacity: 0.45;
}

.candidate-list {
  max-height: min(360px, 42vh);
  margin-top: 10px;
  overflow: auto;
  border: 1px solid var(--theme-line);
  border-radius: 12px;
  background: var(--surface-raised);
}

.candidate-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--theme-line-soft);
  cursor: pointer;
}

.candidate-item:last-child {
  border-bottom: 0;
}

.candidate-item:hover {
  background: var(--surface-hover);
}

.candidate-item span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  padding: 18px;
  color: var(--text-tertiary);
  text-align: center;
}

.capacity-note {
  margin-top: 8px;
}
</style>
