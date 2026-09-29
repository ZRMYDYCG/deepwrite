<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { computed } from "vue";
import type { LongWorldbuildingSyncPreparedChange } from "../types/longWorkspace";
import type { LongWorldbuildingSyncBookOption } from "../utils/longWorldbuildingSync";
import LongImpactConfirmationDetails from "./LongImpactConfirmationDetails.vue";
import PopupSelect, {
  type PopupSelectOption,
  type PopupSelectValue
} from "./PopupSelect.vue";

const t = createScopedTranslator("components.longWorldbuildingSyncDialog");

const props = withDefaults(
  defineProps<{
    open: boolean;
    currentBookId?: string | null;
    selectedBookId: string;
    bookOptions: readonly LongWorldbuildingSyncBookOption[];
    prepared: LongWorldbuildingSyncPreparedChange | null;
    locked?: boolean;
    pending?: boolean;
  }>(),
  {
    currentBookId: null,
    locked: false,
    pending: false
  }
);

const emit = defineEmits<{
  close: [];
  confirm: [];
  "update:selectedBookId": [bookId: string];
}>();

const selectOptions = computed<PopupSelectOption[]>(() =>
  props.bookOptions
    .filter(({ id }) => id !== props.currentBookId)
    .map((book) => ({
      value: book.id,
      label:
        book.categoryCount > 0
          ? t("valueValueCategories", {
              arg0: book.title,
              arg1: book.categoryCount
            })
          : book.title
    }))
);
const selectedBook = computed(
  () => props.bookOptions.find(({ id }) => id === props.selectedBookId) ?? null
);

function selectBook(value: PopupSelectValue): void {
  emit("update:selectedBookId", typeof value === "string" ? value : "");
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="dialog-backdrop sync-overlay"
      @mousedown.self="emit('close')"
      @keydown.esc.stop="emit('close')"
    >
      <section
        class="sync-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="long-structure-sync-title"
        aria-describedby="long-structure-sync-description"
      >
        <header>
          <div>
            <span>SYNC</span>
            <h3 id="long-structure-sync-title">
              {{ t("loadWorldbuildingFromAnotherBook") }}
            </h3>
          </div>
          <button
            class="close-button"
            type="button"
            :aria-label="t('close')"
            :disabled="locked"
            @click="emit('close')"
          >
            ×
          </button>
        </header>
        <fieldset :disabled="locked">
          <p id="long-structure-sync-description">
            {{ t("syncReplacesAllEditableWorldbuildingInThisBookWith") }}
          </p>
          <label>
            <span>{{ t("selectSourceNovel") }}</span>
            <PopupSelect
              :model-value="selectedBookId"
              :options="selectOptions"
              :accessible-label="t('selectANovelToSyncWorldbuildingFrom')"
              :menu-z-index="2300"
              @update:model-value="selectBook"
            />
          </label>
          <p v-if="selectedBook" class="summary">
            {{
              t("readAllContentFromTheWorldbuildingCategoriesMessage", {
                arg0: selectedBook.title ?? "",
                arg1: selectedBook.categoryCount ?? ""
              })
            }}
          </p>
          <template v-if="prepared">
            <p class="summary">
              {{
                t("categoriesToAddCategoriesToDeleteContentMessage", {
                  arg0: prepared.createdCategoryCount ?? "",
                  arg1: prepared.deletedCategoryCount ?? "",
                  arg2: prepared.writtenFileCount ?? ""
                })
              }}
            </p>
            <LongImpactConfirmationDetails
              :confirmation="prepared.confirmation"
              :fallback="t('syncWillNotChangeLinksInTheCurrentNovel')"
            />
          </template>
        </fieldset>
        <footer>
          <button type="button" :disabled="locked" @click="emit('close')">
            {{ t("cancel") }}
          </button>
          <button
            :class="{ 'danger-button': Boolean(prepared) }"
            type="button"
            :disabled="locked || !selectedBookId"
            @click="emit('confirm')"
          >
            {{
              pending
                ? prepared
                  ? t("syncing")
                  : t("checking")
                : prepared
                  ? t("overwriteWithTheImpactShown")
                  : t("reviewSyncImpact")
            }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.sync-overlay {
  z-index: 2200;
  overflow: auto;
  padding: 1rem;
}

.sync-modal {
  width: min(31rem, 100%);
  max-height: min(88vh, 48rem);
  overflow: auto;
  border: 1px solid var(--theme-line);
  border-radius: 0.9rem;
  color: var(--text-primary);
  background: var(--surface-main);
  box-shadow: 0 1.2rem 3.5rem
    color-mix(in srgb, var(--theme-foreground) 24%, transparent);
  font-size: 0.875rem;
}

header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem;
}

header {
  border-bottom: 1px solid var(--theme-line-soft);
}

header h3 {
  margin: 0.15rem 0 0;
}

header span {
  color: var(--accent);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.close-button {
  width: 2rem;
  padding: 0;
  border-color: transparent;
  background: transparent;
  font-size: 1.2rem;
}

fieldset {
  display: grid;
  min-inline-size: 0;
  gap: 0.85rem;
  margin: 0;
  padding: 1rem;
  border: 0;
}

fieldset > p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.55;
}

label {
  display: grid;
  gap: 0.4rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.summary {
  padding: 0.75rem;
  border: 1px solid var(--theme-line);
  border-radius: 0.65rem;
  background: var(--surface-muted);
}

footer {
  justify-content: flex-end;
  border-top: 1px solid var(--theme-line-soft);
  background: var(--surface-muted);
}

.danger-button {
  border-color: var(--danger);
  color: #fff;
  background: var(--danger);
  font-weight: 650;
}
</style>
