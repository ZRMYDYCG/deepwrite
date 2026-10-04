<script setup lang="ts">
import type {
  BookIdentityRecord,
  BookIdentityField,
  ChatAssistantProjectRef
} from "@deepwrite/contracts/renderer";
import { coverUrl, identityT as t } from "./book-identity-utils";
import { uiMessage } from "../../ui-feedback";
const props = defineProps<{
  record: BookIdentityRecord;
  book: ChatAssistantProjectRef;
  bookTitle: string;
  activeField: BookIdentityField;
  counts: Record<BookIdentityField, number>;
}>();
defineEmits<{
  field: [field: BookIdentityField];
  rename: [title: string];
  clear: [field: BookIdentityField];
  export: [];
}>();
async function copy() {
  try {
    await navigator.clipboard.writeText(
      props.record.adopted.synopsis?.text ?? ""
    );
    uiMessage.success(t("copied"));
  } catch {
    uiMessage.error(t("failed"));
  }
}
</script>
<template>
  <section class="identity-summary">
    <article
      class="analysis-card"
      :class="{ 'is-active': activeField === 'title' }"
      @click="$emit('field', 'title')"
    >
      <button
        class="identity-summary-label"
        :aria-pressed="activeField === 'title'"
        @click.stop="$emit('field', 'title')"
      >
        {{ t("titleField") }}
      </button>
      <div class="identity-summary-preview">
        <template v-if="record.adopted.title">
          <h2
            class="identity-summary-title"
            :title="record.adopted.title.title"
          >
            {{ record.adopted.title.title }}
          </h2>
          <p
            v-if="record.adopted.title.subtitle"
            class="identity-summary-line"
            :title="record.adopted.title.subtitle"
          >
            {{ record.adopted.title.subtitle }}
          </p>
          <p
            v-if="record.adopted.title.title !== bookTitle"
            class="identity-muted identity-summary-line"
            :title="t('oldName', { name: bookTitle })"
          >
            {{ t("oldName", { name: bookTitle }) }}
          </p>
        </template>
        <p v-else class="identity-muted">
          {{ t("notAdopted", { count: counts.title }) }}
        </p>
      </div>
      <div class="identity-actions identity-summary-actions">
        <template v-if="record.adopted.title">
          <button
            v-if="record.adopted.title.title !== bookTitle"
            class="identity-link"
            @click.stop="$emit('rename', record.adopted.title.title)"
          >
            {{ t("rename") }}
          </button>
          <button class="identity-link" @click.stop="$emit('clear', 'title')">
            {{ t("clearAdoption") }}
          </button>
        </template>
      </div>
    </article>
    <article
      class="analysis-card"
      :class="{ 'is-active': activeField === 'synopsis' }"
      @click="$emit('field', 'synopsis')"
    >
      <button
        class="identity-summary-label"
        :aria-pressed="activeField === 'synopsis'"
        @click.stop="$emit('field', 'synopsis')"
      >
        {{ t("synopsisField") }}
      </button>
      <div class="identity-summary-preview">
        <template v-if="record.adopted.synopsis">
          <p class="identity-clamp" :title="record.adopted.synopsis.text">
            {{ record.adopted.synopsis.text }}
          </p>
          <small>{{
            t("chars", { count: record.adopted.synopsis.text.length })
          }}</small>
        </template>
        <p v-else class="identity-muted">
          {{ t("notAdopted", { count: counts.synopsis }) }}
        </p>
      </div>
      <div class="identity-actions identity-summary-actions">
        <template v-if="record.adopted.synopsis">
          <button @click.stop="copy">{{ t("copy") }}</button>
          <button @click.stop="$emit('clear', 'synopsis')">
            {{ t("clearAdoption") }}
          </button>
        </template>
      </div>
    </article>
    <article
      class="analysis-card"
      :class="{ 'is-active': activeField === 'cover' }"
      @click="$emit('field', 'cover')"
    >
      <button
        class="identity-summary-label"
        :aria-pressed="activeField === 'cover'"
        @click.stop="$emit('field', 'cover')"
      >
        {{ t("coverField") }}
      </button>
      <div class="identity-summary-preview">
        <img
          v-if="record.adopted.cover"
          class="identity-adopted-cover"
          :src="
            coverUrl(
              book,
              'cover.png',
              Date.parse(record.adopted.cover.adoptedAt)
            )
          "
          :alt="bookTitle"
        />
        <p v-else class="identity-muted">
          {{ t("notAdopted", { count: counts.cover }) }}
        </p>
      </div>
      <div class="identity-actions identity-summary-actions">
        <template v-if="record.adopted.cover">
          <button @click.stop="$emit('export')">{{ t("export") }}</button>
          <button @click.stop="$emit('clear', 'cover')">
            {{ t("clearAdoption") }}
          </button>
        </template>
      </div>
    </article>
  </section>
</template>
<style scoped src="./book-identity.css"></style>
<style scoped src="./adopted-summary.css"></style>
