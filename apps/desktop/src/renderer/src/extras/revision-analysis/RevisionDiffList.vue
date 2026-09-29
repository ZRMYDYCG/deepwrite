<script setup lang="ts">
import { createScopedTranslator } from "../../i18n";
import { ref, watch } from "vue";
import {
  REVISION_REASON_LIMIT,
  type RevisionChange
} from "@deepwrite/contracts/renderer";

const t = createScopedTranslator("extras.revisionAnalysis");
const props = defineProps<{
  changes: RevisionChange[];
  disabled: boolean;
  current: boolean;
  canCompare: boolean;
}>();
const emit = defineEmits<{
  reason: [id: string, text: string];
  compare: [];
}>();
const visible = ref(20);
const expanded = ref(false);
watch(
  () => props.changes,
  () => {
    visible.value = 20;
  }
);
function update(id: string, event: Event) {
  emit("reason", id, (event.target as HTMLTextAreaElement).value);
}
</script>
<template>
  <section class="revision-differences">
    <header class="revision-differences-header">
      <div class="revision-heading">
        <h2>
          {{ t("paragraphNotes")
          }}<small v-if="current" class="revision-count">{{
            t("changeGroupCount", {
              count: changes.length
            })
          }}</small>
        </h2>
        <button
          class="revision-text-button"
          type="button"
          :disabled="!canCompare"
          @click="
            emit('compare');
            expanded = true;
          "
        >
          {{ current ? t("refreshDifferences") : t("previewDifferences") }}
        </button>
        <button
          v-if="changes.length"
          class="revision-text-button"
          type="button"
          :aria-expanded="expanded"
          :aria-label="
            expanded
              ? t('collapseDifferenceParagraphs')
              : t('expandDifferenceParagraphs')
          "
          @click="expanded = !expanded"
        >
          <span>{{
            expanded ? t("collapseDifferences") : t("expandDifferences")
          }}</span>
          <svg
            class="revision-toggle-icon"
            :class="{ 'is-expanded': expanded }"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
      </div>
      <span class="revision-comparison-status">{{
        current ? t("currentTextCompared") : t("differencesUpdateOnStart")
      }}</span>
    </header>
    <p v-if="expanded && !changes.length && current">
      {{ t("noParagraphDifferences") }}
    </p>
    <article
      v-for="(change, index) in changes.slice(0, visible)"
      v-show="expanded"
      :key="change.id"
      class="revision-change"
    >
      <header>
        <strong>{{ t("differenceNumber", { number: index + 1 }) }}</strong
        ><small v-if="change.coarse">{{ t("largeChangesGrouped") }}</small>
      </header>
      <div class="revision-change-grid">
        <section>
          <h3>
            {{ t("beforeRevision")
            }}<small v-if="change.beforeStart">{{
              t("startingAtLine", {
                line: change.beforeStart
              })
            }}</small>
          </h3>
          <pre>{{ change.before || t("noMatchingParagraph") }}</pre>
        </section>
        <section>
          <h3>
            {{ t("afterRevision")
            }}<small v-if="change.afterStart">{{
              t("startingAtLine", {
                line: change.afterStart
              })
            }}</small>
          </h3>
          <pre>{{ change.after || t("noMatchingParagraph") }}</pre>
        </section>
        <label>
          <span
            >{{ t("revisionReason") }}<small>{{ t("optional") }}</small></span
          >
          <textarea
            :value="change.reason"
            :maxlength="REVISION_REASON_LIMIT"
            :disabled="disabled || !current"
            :aria-label="
              t('differenceReason', {
                number: index + 1
              })
            "
            :placeholder="t('reasonPlaceholder')"
            @input="update(change.id, $event)"
          />
        </label>
      </div>
    </article>
    <button
      v-if="expanded && visible < changes.length"
      class="revision-text-button"
      @click="visible += 20"
    >
      {{
        t("showMoreDifferences", {
          count: Math.min(20, changes.length - visible)
        })
      }}
    </button>
  </section>
</template>

<style scoped>
.revision-differences > .revision-differences-header {
  align-items: center;
  gap: 12px 20px;
}
.revision-heading,
.revision-heading h2 {
  display: flex;
  align-items: center;
}
.revision-heading {
  flex-wrap: wrap;
  gap: 8px 14px;
  min-width: 0;
}
.revision-heading h2 {
  gap: 9px;
  line-height: 1.5;
}
.revision-count {
  padding: 2px 8px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 7px;
  background: var(--surface-muted);
  font-size: 0.75em;
  font-weight: 500;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.revision-toggle-icon {
  width: 1em;
  height: 1em;
  flex: none;
  transition: transform 200ms ease;
}
.revision-toggle-icon.is-expanded {
  transform: rotate(180deg);
}
.revision-comparison-status {
  color: var(--text-secondary);
  font-size: 0.85rem;
  line-height: 1.5;
}
@media (prefers-reduced-motion: reduce) {
  .revision-toggle-icon {
    transition: none;
  }
}
</style>
