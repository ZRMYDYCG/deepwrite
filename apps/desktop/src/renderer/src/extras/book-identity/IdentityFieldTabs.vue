<script setup lang="ts">
import type { BookIdentityField } from "@deepwrite/contracts/renderer";
import { fields, fieldLabel } from "./book-identity-utils";

defineProps<{ label: string; panelId: string; disabled?: boolean }>();
const field = defineModel<BookIdentityField>({ required: true });

function navigate(event: KeyboardEvent, value: BookIdentityField) {
  const index = fields.indexOf(value);
  const next = {
    ArrowRight: (index + 1) % fields.length,
    ArrowLeft: (index + fields.length - 1) % fields.length,
    Home: 0,
    End: fields.length - 1
  }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  field.value = fields[next]!;
  (event.currentTarget as HTMLElement).parentElement
    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    [next]?.focus();
}
</script>

<template>
  <div class="identity-field-tabs" role="tablist" :aria-label="label">
    <button
      v-for="value in fields"
      :id="`${panelId}-${value}-tab`"
      :key="value"
      type="button"
      role="tab"
      :aria-selected="field === value"
      :aria-controls="panelId"
      :tabindex="field === value ? 0 : -1"
      :class="{ 'is-active': field === value }"
      :disabled="disabled"
      @click="field = value"
      @keydown="navigate($event, value)"
    >
      {{ fieldLabel(value) }}
    </button>
  </div>
</template>

<style scoped>
.identity-field-tabs {
  display: grid;
  flex-shrink: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  margin: 16px 18px 0;
  padding: 4px;
  border-radius: 9px;
  background: var(--surface-muted);
}
.identity-field-tabs button {
  min-width: 0;
  padding: 8px 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}
.identity-field-tabs button:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}
.identity-field-tabs button.is-active {
  background: var(--surface-raised);
  color: var(--text-primary);
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.06);
}
.identity-field-tabs button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
