import { computed, ref } from "vue";
/** Lightweight status imported by the sidebar without loading the feature. */
export const bookIdentityAgentRunning = ref(false);
export const bookIdentityImageRunning = ref(false);
export const bookIdentityRunning = computed(
  () => bookIdentityAgentRunning.value || bookIdentityImageRunning.value
);
