<script setup lang="ts">
import { computed, ref } from "vue";
import type {
  CatalogSnapshot,
  CreateDecompositionJobInput,
  ModelConfig
} from "@deepwrite/contracts/renderer";
import AnalysisModelSettings from "../analysis-ui/AnalysisModelSettings.vue";
import PopupSelect from "../../components/PopupSelect.vue";
import { createScopedTranslator } from "../../i18n";
import DecompositionEstimate from "./DecompositionEstimate.vue";
import type { LongBookDecompositionController } from "./useLongBookDecomposition";
const t = createScopedTranslator("extras.longBookDecomposition");
const props = defineProps<{
  controller: LongBookDecompositionController;
  models: readonly ModelConfig[];
  catalog: CatalogSnapshot | null;
  range: { start: number; end: number };
  disabled: boolean;
}>();
const emit = defineEmits<{
  create: [
    input: Pick<
      CreateDecompositionJobInput,
      "mode" | "targetSelection" | "autoContinue" | "reuseJobId"
    >
  ];
}>();
const mode = ref<"continuation" | "materials">("continuation");
const targetAction = ref<"create" | "select">("create");
const targetId = ref("");
const title = ref("");
const autoContinue = ref(false);
const reuseJobId = ref("");
const isLong = computed(() => mode.value === "continuation");
const targets = computed(() =>
  isLong.value
    ? props.controller.books.value.map(({ id, title }) => ({
        value: id,
        label: title
      }))
    : (props.catalog?.materialGroups ?? []).map(({ id, title }) => ({
        value: id,
        label: title
      }))
);
const targetActions = computed(() => [
  {
    value: "create",
    label: isLong.value ? t("createLong") : t("createGroup")
  },
  {
    value: "select",
    label: isLong.value ? t("selectLong") : t("selectGroup")
  }
]);
const estimate = computed(() => {
  try {
    return props.controller.estimate(props.range);
  } catch {
    return null;
  }
});
const reuseOptions = computed(() => [
  { value: "", label: t("noReuse") },
  ...props.controller.jobs.value
    .filter(
      (job) =>
        job.source.fingerprint ===
          props.controller.confirmation.value?.fingerprint &&
        job.source.range.start === props.range.start &&
        job.source.range.end === props.range.end &&
        job.units["registry:merge"]?.status === "done"
    )
    .map((job) => ({
      value: job.id,
      label: `${job.source.title} · ${job.createdAt.slice(0, 10)}`
    }))
]);
/** Why creating is not possible yet; a stable line instead of a toast. */
const blocker = computed(() => {
  const { source, sourceDirty, sourceSaving, confirmation } = props.controller;
  if (
    !source.value ||
    sourceDirty.value ||
    sourceSaving.value ||
    !confirmation.value
  )
    return t("sourceRequired");
  if (
    !props.controller.readingModelId.value ||
    !props.controller.integrationModelId.value
  )
    return t("modelRequired");
  if (targetAction.value === "select" && !targetId.value)
    return t("targetRequired");
  return "";
});
function create() {
  const kind = isLong.value ? "long" : "material-group";
  const targetSelection: CreateDecompositionJobInput["targetSelection"] =
    targetAction.value === "create"
      ? {
          kind,
          action: "create",
          title:
            title.value.trim() ||
            props.controller.source.value?.name ||
            t("title")
        }
      : kind === "long"
        ? { kind, action: "select", bookId: targetId.value }
        : { kind, action: "select", groupId: targetId.value };
  emit("create", {
    mode: mode.value,
    targetSelection,
    autoContinue: autoContinue.value,
    ...(reuseJobId.value ? { reuseJobId: reuseJobId.value } : {})
  });
}
</script>
<template>
  <section class="analysis-card setup-card decomposition-setup">
    <header class="analysis-card-heading">
      <div>
        <p class="analysis-eyebrow">{{ t("setupEyebrow") }}</p>
        <h2>{{ t("setup") }}</h2>
      </div>
    </header>
    <div class="setup-grid">
      <label class="setup-field">
        <span class="setup-field-label">{{ t("mode") }}</span>
        <PopupSelect
          v-model="mode"
          :options="[
            { value: 'continuation', label: t('continuation') },
            { value: 'materials', label: t('materials') }
          ]"
          :accessible-label="t('mode')"
          :disabled="disabled"
          @change="targetId = ''"
        />
      </label>
      <label class="setup-field">
        <span class="setup-field-label">{{ t("profile") }}</span>
        <PopupSelect
          v-model="controller.profileId.value"
          :options="
            controller.profiles.value.map(({ id, name }) => ({
              value: id,
              label: name
            }))
          "
          :accessible-label="t('profile')"
          :disabled="disabled"
        />
      </label>
      <label class="setup-field">
        <span class="setup-field-label">{{ t("target") }}</span>
        <PopupSelect
          v-model="targetAction"
          :options="targetActions"
          :accessible-label="t('target')"
          :disabled="disabled"
        />
      </label>
      <label v-if="targetAction === 'create'" class="setup-field">
        <span class="setup-field-label">{{
          isLong ? t("longTitle") : t("groupTitle")
        }}</span>
        <input
          v-model="title"
          :placeholder="controller.source.value?.name"
          :disabled="disabled"
        />
      </label>
      <label v-else class="setup-field">
        <span class="setup-field-label">{{
          isLong ? t("existingLong") : t("existingGroup")
        }}</span>
        <PopupSelect
          v-model="targetId"
          :options="targets"
          :placeholder="t('choose')"
          :accessible-label="isLong ? t('existingLong') : t('existingGroup')"
          :disabled="disabled"
        />
      </label>
      <div class="setup-field">
        <span class="setup-field-label">{{ t("readingModel") }}</span>
        <AnalysisModelSettings
          v-model:model-id="controller.readingModelId.value"
          v-model:thinking-level="controller.readingThinkingLevel.value"
          field
          :label="t('readingModel')"
          :models="models"
          :disabled="disabled"
        />
      </div>
      <div class="setup-field">
        <span class="setup-field-label">{{ t("integrationModel") }}</span>
        <AnalysisModelSettings
          v-model:model-id="controller.integrationModelId.value"
          v-model:thinking-level="controller.integrationThinkingLevel.value"
          field
          :label="t('integrationModel')"
          :models="models"
          :disabled="disabled"
        />
      </div>
    </div>
    <p class="analysis-help">
      {{ isLong ? t("modeHelpContinuation") : t("modeHelpMaterials") }}
    </p>
    <div class="decomposition-options">
      <label class="setup-field">
        <span class="setup-field-label">{{ t("reuse") }}</span>
        <PopupSelect
          v-model="reuseJobId"
          :options="reuseOptions"
          :accessible-label="t('reuse')"
          :disabled="disabled || reuseOptions.length < 2"
        />
      </label>
      <label class="decomposition-check">
        <input v-model="autoContinue" type="checkbox" :disabled="disabled" />
        <span
          ><strong>{{ t("autoContinue") }}</strong
          ><small>{{ t("autoContinueHelp") }}</small></span
        >
      </label>
    </div>
    <DecompositionEstimate :estimate="estimate" />
    <div class="analysis-run-bar">
      <p class="analysis-help decomposition-run-hint">
        {{ blocker || t("readyHint") }}
      </p>
      <div class="analysis-run-actions">
        <button
          type="button"
          class="analysis-primary-button"
          :disabled="disabled || !!blocker"
          @click="create"
        >
          {{ t("prepare") }}
        </button>
      </div>
    </div>
  </section>
</template>
