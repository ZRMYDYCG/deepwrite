<script setup lang="ts">
import { computed, ref } from "vue";
import PopupSelect from "../../components/PopupSelect.vue";
import type { IdentityBookChoice } from "./useIdentityBooks";
import { identityT as t } from "./book-identity-utils";
const props = defineProps<{
  books: readonly IdentityBookChoice[];
  selected?: IdentityBookChoice | undefined;
}>();
defineEmits<{ select: [key: string]; open: []; create: [] }>();
const filter = ref("all");
const options = computed(() =>
  props.books
    .filter(
      (b) => filter.value === "all" || b.book.projectType === filter.value
    )
    .map((b) => ({ value: b.key, label: b.title, description: b.description }))
);
</script>
<template>
  <section class="analysis-card identity-picker">
    <div class="identity-segments">
      <button
        v-for="type in ['all', 'short', 'script', 'long']"
        :key="type"
        :class="{ 'is-active': filter === type }"
        @click="filter = type"
      >
        {{ t(type) }}
      </button>
    </div>
    <template v-if="books.length"
      ><PopupSelect
        :model-value="selected?.key ?? ''"
        :options="options"
        :accessible-label="t('chooseBook')"
        :placeholder="t('chooseBook')"
        @update:model-value="$emit('select', String($event))"
      />
      <div v-if="selected" class="identity-row">
        <span class="identity-muted">{{ selected.description }}</span
        ><button class="identity-link" @click="$emit('open')">
          {{ t("openBook") }}
        </button>
      </div>
    </template>
    <template v-else
      ><p>{{ t("noBooks") }}</p>
      <button class="analysis-primary-button" @click="$emit('create')">
        {{ t("createBook") }}
      </button></template
    >
  </section>
</template>
<style scoped src="./book-identity.css"></style>
