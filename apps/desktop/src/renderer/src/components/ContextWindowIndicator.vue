<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch
} from "vue";
import type { ModelConfig } from "@deepwrite/contracts";
import { useContextWindowUsage } from "../composables/useContextWindowUsage";
import type { ChatMessage } from "../types/conversation";
import {
  formatContextPercentage,
  formatContextTokens
} from "../utils/contextWindowUsage";

const t = createScopedTranslator("components.contextWindowIndicator");

const props = defineProps<{
  messages: ChatMessage[];
  model: ModelConfig | undefined;
}>();

const trigger = ref<HTMLButtonElement>();
const tooltip = ref<HTMLElement>();
const hovered = ref(false);
const focused = ref(false);
const tooltipPosition = ref<{
  left: string;
  top: string;
  visibility: "hidden" | "visible";
}>({ left: "0px", top: "0px", visibility: "hidden" });
const tooltipId = `context-window-tooltip-${useId()}`;
const tooltipOpen = computed(() => hovered.value || focused.value);
const { capacityStatus, contextWindow, measurement, usedTokens } =
  useContextWindowUsage({
    messages: () => props.messages,
    selectedModel: () => props.model
  });

const dashOffset = computed(() =>
  measurement.value ? 100 - measurement.value.drawRatio * 100 : 100
);
const usedPercentageLabel = computed(() =>
  measurement.value
    ? formatContextPercentage(measurement.value.usedPercentage)
    : undefined
);
const remainingPercentageLabel = computed(() =>
  measurement.value
    ? formatContextPercentage(measurement.value.remainingPercentage)
    : undefined
);
const tokenRatioLabel = computed(() =>
  measurement.value
    ? `${formatContextTokens(measurement.value.usedTokens)} / ${formatContextTokens(
        measurement.value.contextWindow
      )} tokens`
    : undefined
);
const unavailableDetail = computed(() => {
  if (usedTokens.value !== undefined) {
    return t("valueTokensRecorded", {
      arg0: formatContextTokens(usedTokens.value)
    });
  }
  if (contextWindow.value !== undefined) {
    return t("maximumContextValueTokens", {
      arg0: formatContextTokens(contextWindow.value)
    });
  }
  return undefined;
});
const statusLabel = computed(() => {
  if (!props.model) return t("noModelSelected");
  if (capacityStatus.value === "resolving") return t("readingContextLimit");
  if (capacityStatus.value === "unavailable")
    return t("contextLimitUnavailable");
  if (!measurement.value) return t("awaitingActualUsage");
  return t("usedValueValueRemaining", {
    arg0: usedPercentageLabel.value ?? "—",
    arg1: remainingPercentageLabel.value ?? "—"
  });
});
const accessibleLabel = computed(() => {
  const modelLabel = props.model?.label ?? t("currentModel");
  const detail = tokenRatioLabel.value ?? unavailableDetail.value;
  return [modelLabel, statusLabel.value, detail].filter(Boolean).join("，");
});
const visualState = computed(() => {
  if (capacityStatus.value === "resolving") return "resolving";
  if (!measurement.value) return "unmeasured";
  return measurement.value.usedPercentage > 100 ? "over-limit" : "measured";
});

async function updateTooltipPosition(): Promise<void> {
  if (!tooltipOpen.value) return;
  await nextTick();
  const triggerElement = trigger.value;
  const tooltipElement = tooltip.value;
  if (!triggerElement || !tooltipElement) return;

  const triggerRect = triggerElement.getBoundingClientRect();
  const margin = 8;
  const gap = 8;
  const width = tooltipElement.offsetWidth;
  const height = tooltipElement.offsetHeight;
  const left = Math.min(
    Math.max(margin, triggerRect.left + triggerRect.width / 2 - width / 2),
    Math.max(margin, window.innerWidth - width - margin)
  );
  const preferredTop = triggerRect.top - height - gap;
  const top =
    preferredTop >= margin
      ? preferredTop
      : Math.min(
          triggerRect.bottom + gap,
          Math.max(margin, window.innerHeight - height - margin)
        );
  tooltipPosition.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    visibility: "visible"
  };
}

function closeTooltip(): void {
  hovered.value = false;
  focused.value = false;
  trigger.value?.blur();
}

function handleViewportChange(): void {
  if (tooltipOpen.value) void updateTooltipPosition();
}

watch(
  () => [
    tooltipOpen.value,
    capacityStatus.value,
    contextWindow.value,
    usedTokens.value
  ],
  () => {
    if (!tooltipOpen.value) {
      tooltipPosition.value.visibility = "hidden";
      return;
    }
    void updateTooltipPosition();
  }
);

onMounted(() => {
  window.addEventListener("resize", handleViewportChange);
  window.addEventListener("scroll", handleViewportChange, true);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleViewportChange);
  window.removeEventListener("scroll", handleViewportChange, true);
});
</script>

<template>
  <span class="context-window-indicator" :data-state="visualState">
    <button
      ref="trigger"
      class="context-window-indicator-trigger"
      type="button"
      :aria-label="accessibleLabel"
      :aria-describedby="tooltipOpen ? tooltipId : undefined"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
      @focus="focused = true"
      @blur="focused = false"
      @keydown.esc.prevent="closeTooltip"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle class="context-window-indicator-track" cx="8" cy="8" r="5.5" />
        <circle
          class="context-window-indicator-progress"
          cx="8"
          cy="8"
          r="5.5"
          pathLength="100"
          stroke-dasharray="100"
          :stroke-dashoffset="dashOffset"
        />
      </svg>
    </button>

    <Teleport to="body">
      <section
        v-if="tooltipOpen"
        :id="tooltipId"
        ref="tooltip"
        class="context-window-tooltip"
        role="tooltip"
        :style="tooltipPosition"
      >
        <strong>{{ model?.label ?? t("contextWindow") }}</strong>
        <span>{{ statusLabel }}</span>
        <small v-if="tokenRatioLabel">{{ tokenRatioLabel }}</small>
        <small v-else-if="unavailableDetail">{{ unavailableDetail }}</small>
      </section>
    </Teleport>
  </span>
</template>
