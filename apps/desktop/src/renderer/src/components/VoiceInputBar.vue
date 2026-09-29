<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { VOICE_MAX_DURATION_MS } from "@deepwrite/contracts/renderer";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { VoiceInputState } from "../composables/useVoiceInput";
import AppIcon from "./AppIcon.vue";

const t = createScopedTranslator("components.voiceInputBar");

const props = withDefaults(
  defineProps<{
    state: VoiceInputState;
    elapsedMs: number;
    levels: number[];
    showSend?: boolean;
    sendDisabled?: boolean;
  }>(),
  { showSend: true, sendDisabled: false }
);

const emit = defineEmits<{ cancel: []; stop: []; send: []; retry: [] }>();
const waveElement = ref<HTMLDivElement | null>(null);
const dotCount = ref(64);
const visibleLevels = computed(() => {
  const recent = props.levels.slice(-dotCount.value);
  return [
    ...Array<number>(Math.max(0, dotCount.value - recent.length)).fill(0),
    ...recent
  ];
});
let resizeObserver: ResizeObserver | undefined;
onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    if (entry)
      dotCount.value = Math.max(
        1,
        Math.min(256, Math.floor((entry.contentRect.width + 3) / 6))
      );
  });
  if (waveElement.value) resizeObserver.observe(waveElement.value);
});
onBeforeUnmount(() => resizeObserver?.disconnect());

const duration = computed(() => {
  const seconds = Math.floor(props.elapsedMs / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
});
const maxDurationSeconds = Math.floor(VOICE_MAX_DURATION_MS / 1_000);
const maxDuration = `${Math.floor(maxDurationSeconds / 60)}:${String(maxDurationSeconds % 60).padStart(2, "0")}`;
const status = computed(() => {
  if (props.state === "starting") return t("startingMicrophone");
  if (props.state === "transcribing") return t("transcribing");
  if (props.state === "error") return t("thisRecordingCanBeRetried");
  return `${duration.value} / ${maxDuration}`;
});
</script>

<template>
  <div
    class="voice-input-bar"
    :class="`is-${state}`"
    :aria-label="t('voiceInputControls')"
  >
    <button
      class="voice-action"
      type="button"
      :aria-label="t('cancelVoiceInput')"
      :title="t('cancelVoiceInput')"
      @click="emit('cancel')"
    >
      <AppIcon name="close" :size="19" />
    </button>
    <div
      class="voice-wave-area"
      :class="{ 'is-transcribing': state === 'transcribing' }"
    >
      <div
        v-show="state !== 'transcribing'"
        ref="waveElement"
        class="voice-wave"
        aria-hidden="true"
      >
        <span
          v-for="(level, index) in visibleLevels"
          :key="index"
          :style="{
            height: `${3 + level * 19}px`,
            opacity: 0.3 + level * 0.5
          }"
        />
      </div>
      <span
        :class="
          state === 'transcribing' ? 'voice-transcribing-label' : 'voice-status'
        "
        role="status"
        >{{ status }}</span
      >
    </div>
    <button
      v-if="state === 'error'"
      class="voice-retry"
      type="button"
      @click="emit('retry')"
    >
      {{ t("retry") }}
    </button>
    <button
      v-else
      class="voice-action"
      :class="{ 'voice-progress': state === 'transcribing' }"
      type="button"
      :aria-label="
        state === 'transcribing' ? t('transcribing') : t('stopAndTranscribe')
      "
      :title="
        state === 'transcribing' ? t('transcribing') : t('stopAndTranscribe')
      "
      :disabled="state !== 'recording'"
      @click="emit('stop')"
    >
      <span
        v-if="state === 'transcribing'"
        class="voice-spinner"
        aria-hidden="true"
      />
      <AppIcon v-else name="stop" :size="16" />
    </button>
    <button
      v-if="showSend"
      class="voice-action voice-send"
      type="button"
      :aria-label="t('transcribeAndSend')"
      :title="t('stopTranscribeAndSend')"
      :disabled="state !== 'recording' || sendDisabled"
      @click="emit('send')"
    >
      <AppIcon name="arrow-up" :size="21" />
    </button>
  </div>
</template>

<style scoped src="./voice-input-bar.css"></style>
