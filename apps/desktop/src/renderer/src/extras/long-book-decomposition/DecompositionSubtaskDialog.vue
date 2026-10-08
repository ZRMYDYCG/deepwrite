<script setup lang="ts">
import { computed, onMounted, ref, useId } from "vue";
import type {
  DecompositionRegistry,
  LongBookDecompositionJob
} from "@deepwrite/contracts/renderer";
import ConversationRunClock from "../../components/ConversationRunClock.vue";
import SubagentRunDetail from "../../components/SubagentRunDetail.vue";
import {
  subagentDuration,
  subagentStatusLabel,
  subagentUsageLabel
} from "../../components/subagentRunPresentation";
import { createScopedTranslator } from "../../i18n";
import type { AgentSubagentRun } from "../../types/conversation";
import { decompositionDialogKeydown } from "./dialog-keys";
import { decompositionUnitLabel } from "./unit-label";

const t = createScopedTranslator("extras.longBookDecomposition");
const props = defineProps<{
  run: AgentSubagentRun;
  unitIds: readonly string[];
  job: LongBookDecompositionJob;
  registry: DecompositionRegistry | null;
}>();
const emit = defineEmits<{
  close: [];
  view: [unitId: string, title: string];
}>();
const titleId = useId();
const dialog = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const units = computed(() =>
  props.unitIds.map((id) => ({
    id,
    label: decompositionUnitLabel(props.job, id, props.registry),
    done: props.job.units[id]?.status === "done"
  }))
);
const active = computed(() => props.run.status === "running");
const tone = computed(() =>
  active.value
    ? "is-accent"
    : props.run.status === "completed"
      ? "is-success"
      : props.run.status === "error"
        ? "is-danger"
        : "is-neutral"
);
onMounted(() => closeButton.value?.focus());
</script>

<template>
  <Teleport to="body">
    <div class="analysis-refresh-backdrop" @mousedown.self="emit('close')">
      <section
        ref="dialog"
        class="decomposition-record-dialog decomposition-subtask-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @keydown="
          decompositionDialogKeydown($event, dialog, () => emit('close'))
        "
      >
        <header class="decomposition-subtask-dialog-head">
          <div>
            <p class="decomposition-subtask-dialog-eyebrow">
              {{ t("subtaskDialogEyebrow") }}
            </p>
            <h2 :id="titleId">
              {{ run.name
              }}<template v-if="units[0]"> · {{ units[0].label }}</template>
            </h2>
            <p class="decomposition-subtask-dialog-sub">
              <template v-if="run.batchTask">
                {{ t("subtaskKey", { key: run.batchTask.key }) }} ·
              </template>
              {{ run.runtime.model }}
            </p>
          </div>
          <ConversationRunClock v-slot="{ now }" :active="active">
            <span class="decomposition-pill" :class="tone">
              {{ subagentStatusLabel(run, now) }}
              <template v-if="subagentDuration(run, now)">
                · {{ subagentDuration(run, now) }}
              </template>
            </span>
          </ConversationRunClock>
        </header>
        <div
          class="decomposition-record-body decomposition-subtask-body"
          tabindex="0"
        >
          <section class="decomposition-subtask-units">
            <h3>{{ t("subtaskUnitsTitle") }}</h3>
            <p v-if="!units.length" class="decomposition-record-empty">
              {{ t("subtaskNoUnits") }}
            </p>
            <ul v-else>
              <li v-for="unit in units" :key="unit.id">
                <span class="decomposition-subtask-unit-label">{{
                  unit.label
                }}</span>
                <code>{{ unit.id }}</code>
                <button
                  v-if="unit.done"
                  type="button"
                  @click="emit('view', unit.id, unit.label)"
                >
                  {{ t("subtaskOpenRecord") }}
                </button>
                <span v-else class="decomposition-subtask-unit-state">
                  {{ t(job.units[unit.id]?.status ?? "pending") }}
                </span>
              </li>
            </ul>
          </section>
          <SubagentRunDetail :run="run" />
        </div>
        <div class="decomposition-subtask-dialog-foot">
          <span>
            {{ t("subtaskToolTotal", { count: run.toolCalls.length }) }}
            <template v-if="subagentUsageLabel(run)">
              · {{ subagentUsageLabel(run) }}
            </template>
          </span>
          <button ref="closeButton" type="button" @click="emit('close')">
            {{ t("close") }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
