<script setup lang="ts">
import { nextTick } from "vue";

const props = defineProps<{
  modelValue: boolean;
  disabled?: boolean;
  label?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

// A native checkbox flips itself on click, so it can disagree with the data
// while a change is pending or after the parent rejects it. Report the request,
// then pin the DOM back to the data once the parent has had its chance to update.
function onChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  emit("update:modelValue", input.checked);
  void nextTick(() => {
    input.checked = props.modelValue;
  });
}
</script>

<template>
  <input
    class="agent-team-switch"
    type="checkbox"
    role="switch"
    :checked="modelValue"
    :aria-label="label"
    :aria-checked="modelValue"
    :disabled="disabled"
    @change="onChange"
  />
</template>

<style scoped>
.agent-team-switch {
  position: relative;
  flex: none;
  width: 36px;
  height: 20px;
  margin: 0;
  appearance: none;
  border-radius: 999px;
  background: var(--surface-selected);
  box-shadow: inset 0 0 0 1px var(--theme-line);
  cursor: pointer;
  transition: background-color 150ms ease;
}
.agent-team-switch::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--surface-main);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.22);
  content: "";
  transition: transform 150ms ease;
}
.agent-team-switch:checked {
  background: var(--accent);
  box-shadow: none;
}
.agent-team-switch:checked::after {
  transform: translateX(16px);
}
.agent-team-switch:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.agent-team-switch:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 2px;
}
</style>
