<script setup lang="ts">
import { computed } from "vue";
import type { CatalogSnapshot } from "@deepwrite/contracts/renderer";
import AppIcon from "../../components/AppIcon.vue";
import PopupSelect from "../../components/PopupSelect.vue";
import { createScopedTranslator } from "../../i18n";
import { decompositionJobOption } from "./job-option";
import type { LongBookDecompositionController } from "./useLongBookDecomposition";
const t = createScopedTranslator("extras.longBookDecomposition");
const props = defineProps<{
  controller: Pick<LongBookDecompositionController, "job" | "jobs" | "books">;
  catalog: CatalogSnapshot | null;
  disabled: boolean;
}>();
const emit = defineEmits<{
  select: [id: string];
  newTask: [];
  remove: [];
}>();
const options = computed(() =>
  props.controller.jobs.value.map((job) =>
    decompositionJobOption(job, props.controller.books.value, props.catalog)
  )
);
</script>
<template>
  <section class="analysis-card decomposition-taskbar">
    <label class="decomposition-taskbar-field">
      <span class="setup-field-label">{{ t("jobs") }}</span>
      <PopupSelect
        :model-value="controller.job.value?.id ?? ''"
        :options="options"
        :placeholder="options.length ? t('jobsPlaceholder') : t('noJobs')"
        :accessible-label="t('jobs')"
        :disabled="disabled || !options.length"
        :menu-min-width="320"
        @change="(value) => emit('select', String(value))"
      />
    </label>
    <div v-if="controller.job.value" class="analysis-run-actions">
      <button type="button" :disabled="disabled" @click="emit('newTask')">
        <AppIcon name="plus" :size="15" />{{ t("newTask") }}
      </button>
      <button
        type="button"
        class="analysis-danger-button"
        :disabled="disabled"
        @click="emit('remove')"
      >
        <AppIcon name="trash" :size="15" />{{ t("deleteJob") }}
      </button>
    </div>
  </section>
</template>
