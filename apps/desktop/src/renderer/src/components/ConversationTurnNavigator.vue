<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { computed, onBeforeUnmount, ref, useId } from "vue";
import type { ConversationTurn } from "../composables/useConversationTurnNavigator";

const t = createScopedTranslator("components.conversationTurnNavigator");

const props = defineProps<{
  turns: readonly ConversationTurn[];
  activeTurnId: string | null;
}>();

const emit = defineEmits<{
  select: [messageId: string];
}>();

const navigator = ref<HTMLElement>();
const previewId = useId();
const hoveredTurnId = ref<string | null>(null);
const focusedTurnId = ref<string | null>(null);
const previewTop = ref(0);
let previewHideTimer: number | undefined;
const previewTurnId = computed(
  () => focusedTurnId.value ?? hoveredTurnId.value
);
const previewTurn = computed(() =>
  props.turns.find((turn) => turn.id === previewTurnId.value)
);

function positionPreview(target: HTMLElement): void {
  const container = navigator.value;
  if (!container) return;
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetCenter =
    targetRect.top - containerRect.top + targetRect.height / 2;
  previewTop.value =
    containerRect.height <= 104
      ? containerRect.height / 2
      : Math.min(Math.max(targetCenter, 52), containerRect.height - 52);
}

function showPreview(
  turnId: string,
  event: MouseEvent | FocusEvent,
  source: "hover" | "focus"
): void {
  cancelPreviewHide();
  if (source === "hover") hoveredTurnId.value = turnId;
  else focusedTurnId.value = turnId;
  positionPreview(event.currentTarget as HTMLElement);
}

function hidePreview(turnId: string, source: "hover" | "focus"): void {
  if (source === "hover" && hoveredTurnId.value === turnId) {
    hoveredTurnId.value = null;
  }
  if (source === "focus" && focusedTurnId.value === turnId) {
    focusedTurnId.value = null;
  }
}

function cancelPreviewHide(): void {
  if (previewHideTimer === undefined) return;
  globalThis.clearTimeout(previewHideTimer);
  previewHideTimer = undefined;
}

function schedulePreviewHide(turnId: string, source: "hover" | "focus"): void {
  cancelPreviewHide();
  previewHideTimer = globalThis.setTimeout(() => {
    previewHideTimer = undefined;
    hidePreview(turnId, source);
  }, 120);
}

function dismissPreview(): void {
  cancelPreviewHide();
  hoveredTurnId.value = null;
  focusedTurnId.value = null;
}

function selectTurn(messageId: string): void {
  dismissPreview();
  emit("select", messageId);
}

onBeforeUnmount(cancelPreviewHide);
</script>

<template>
  <nav
    ref="navigator"
    class="conversation-turn-navigator"
    :aria-label="t('conversationTurns')"
  >
    <ol class="conversation-turn-marker-list">
      <li v-for="turn in turns" :key="turn.id">
        <button
          type="button"
          class="conversation-turn-marker"
          :class="{ 'is-active': activeTurnId === turn.id }"
          :data-conversation-turn-id="turn.id"
          :aria-current="activeTurnId === turn.id ? 'location' : undefined"
          :aria-label="
            t('previewTurnValueValue', {
              arg0: turn.number,
              arg1: turn.prompt
            })
          "
          :aria-describedby="previewTurnId === turn.id ? previewId : undefined"
          @mouseenter="showPreview(turn.id, $event, 'hover')"
          @mouseleave="schedulePreviewHide(turn.id, 'hover')"
          @focus="showPreview(turn.id, $event, 'focus')"
          @blur="schedulePreviewHide(turn.id, 'focus')"
          @click="selectTurn(turn.id)"
        >
          <span class="conversation-turn-marker-line" aria-hidden="true" />
        </button>
      </li>
    </ol>
    <button
      v-if="previewTurn"
      :id="previewId"
      type="button"
      class="conversation-turn-preview is-visible"
      :style="{ top: `${previewTop}px` }"
      :aria-label="
        t('goToTurnValueValue', {
          arg0: previewTurn.number,
          arg1: previewTurn.prompt
        })
      "
      @mouseenter="cancelPreviewHide"
      @mouseleave="dismissPreview"
      @focus="cancelPreviewHide"
      @blur="dismissPreview"
      @click="selectTurn(previewTurn.id)"
    >
      <strong>{{ previewTurn.prompt }}</strong>
      <span v-if="previewTurn.response">{{ previewTurn.response }}</span>
    </button>
  </nav>
</template>
