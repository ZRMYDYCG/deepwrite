<script setup lang="ts" generic="T extends string">
export interface AgentTeamSegmentedOption<V extends string> {
  value: V;
  label: string;
}

const selected = defineModel<T>({ required: true });
defineProps<{
  options: readonly AgentTeamSegmentedOption<T>[];
  name: string;
  label: string;
  disabled: boolean;
}>();
</script>

<template>
  <div class="segmented" role="radiogroup" :aria-label="label">
    <label
      v-for="option in options"
      :key="option.value"
      :class="{ 'is-selected': selected === option.value }"
    >
      <input
        type="radio"
        :name="name"
        :value="option.value"
        :checked="selected === option.value"
        :disabled="disabled"
        @change="selected = option.value"
      />
      {{ option.label }}
    </label>
  </div>
</template>

<style scoped>
.segmented {
  display: inline-flex;
  max-width: 100%;
  padding: 3px;
  border: 1px solid var(--theme-line);
  border-radius: 10px;
  background: var(--surface-main);
}
.segmented label {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 14px;
  border-radius: 7px;
  color: var(--text-secondary);
  font-size: 0.857143rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.segmented label:hover {
  color: var(--text-primary);
}
.segmented label.is-selected {
  background: var(--accent-soft);
  color: var(--text-primary);
}
.segmented label:has(input:focus-visible) {
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 1px;
}
.segmented label:has(input:disabled) {
  cursor: not-allowed;
  opacity: 0.55;
}
.segmented input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
