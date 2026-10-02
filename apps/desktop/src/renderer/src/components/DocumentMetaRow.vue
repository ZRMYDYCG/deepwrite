<script setup lang="ts">
withDefaults(defineProps<{ variant?: "standard" | "long" }>(), {
  variant: "standard"
});
</script>

<template>
  <div class="document-meta-bar" :class="`is-${variant}`">
    <div class="document-meta-copy"><slot /></div>
    <div class="document-meta-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.document-meta-bar,
.document-meta-copy,
.document-meta-actions {
  display: flex;
  align-items: center;
  min-width: 0;
}

.document-meta-bar {
  gap: 7px;
  color: var(--text-tertiary);
  font-size: 0.714286rem;
}

.document-meta-bar.is-standard {
  padding-inline: var(--document-inline-padding);
}

.document-meta-bar.is-long {
  padding-inline: var(--long-document-inline-padding);
}

.document-meta-copy {
  overflow: hidden;
  flex: 1 1 auto;
  gap: 7px;
}

.document-meta-actions {
  flex: 0 0 auto;
  gap: 5px;
  margin-left: auto;
}

:slotted(.long-worldbuilding-delete-button) {
  margin-left: 0;
}
</style>
