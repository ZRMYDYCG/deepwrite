<script setup lang="ts">
import { computed } from "vue";
import { createScopedTranslator } from "../../i18n";

const t = createScopedTranslator("extras.agentTeamMarketplace");

const props = defineProps<{
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  loading: boolean;
}>();
const emit = defineEmits<{ change: [page: number] }>();

const pages = computed(() => Math.max(1, props.totalPages));

function go(page: number): void {
  const next = Math.min(Math.max(1, page), pages.value);
  if (next !== props.page && !props.loading) emit("change", next);
}
</script>

<template>
  <nav v-if="total > 0" class="plaza-pagination" :aria-label="t('pagination')">
    <span>{{ t("totalPerPage", { total, size: pageSize }) }}</span>
    <div>
      <button
        type="button"
        class="secondary-button compact"
        :disabled="loading || page <= 1"
        @click="go(1)"
      >
        {{ t("first") }}
      </button>
      <button
        type="button"
        class="secondary-button compact"
        :disabled="loading || page <= 1"
        @click="go(page - 1)"
      >
        {{ t("previous") }}
      </button>
      <strong>{{ t("pageOf", { page, pages }) }}</strong>
      <button
        type="button"
        class="secondary-button compact"
        :disabled="loading || page >= pages"
        @click="go(page + 1)"
      >
        {{ t("next") }}
      </button>
      <button
        type="button"
        class="secondary-button compact"
        :disabled="loading || page >= pages"
        @click="go(pages)"
      >
        {{ t("last") }}
      </button>
    </div>
  </nav>
</template>

<style scoped src="./team-plaza.css"></style>
<style scoped>
.plaza-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--theme-line-soft);
  color: var(--text-tertiary);
  font-size: 12px;
}
.plaza-pagination > div {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
}
.plaza-pagination strong {
  min-width: 88px;
  color: var(--text-secondary);
  font-weight: 600;
  text-align: center;
}
@media (max-width: 820px) {
  .plaza-pagination {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
