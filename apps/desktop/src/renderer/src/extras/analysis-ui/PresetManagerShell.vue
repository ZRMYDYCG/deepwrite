<script setup lang="ts">
defineProps<{
  open: boolean;
  title: string;
  description?: string;
  closeLabel: string;
  modalClass?: string;
}>();
defineEmits<{ close: [] }>();
</script>
<template>
  <Teleport to="body"
    ><div
      v-if="open"
      class="analysis-modal-backdrop"
      @click.self="$emit('close')"
      @keydown.esc.stop="$emit('close')"
    >
      <section
        class="analysis-preset-modal"
        :class="modalClass"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <header>
          <div>
            <p v-if="description">{{ description }}</p>
            <h2>{{ title }}</h2>
          </div>
          <button
            type="button"
            :aria-label="closeLabel"
            @click="$emit('close')"
          >
            ×
          </button>
        </header>
        <slot />
        <footer><slot name="footer" /></footer>
      </section></div
  ></Teleport>
</template>
<style scoped src="../long-book-analysis/preset-manager.css"></style>
<style scoped>
.analysis-preset-modal > footer :deep(button) {
  border: 0;
  border-radius: 8px;
  padding: 7px 10px;
  background: var(--surface-muted);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}
.analysis-preset-modal > footer :deep(.analysis-primary-button) {
  background: var(--text-primary);
  color: var(--surface-main);
}
.analysis-preset-modal :deep(button:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.analysis-preset-modal :deep(button:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
