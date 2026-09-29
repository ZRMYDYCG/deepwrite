<script setup lang="ts">
import { t } from "./index";
function retry(): void {
  window.location.reload();
}
</script>

<template>
  <main class="startup-failure" role="alert">
    <h1>DeepWrite</h1>
    <p>{{ t("foundation.languageResourcesFailed") }}</p>
    <button type="button" @click="retry">
      {{ t("foundation.retryStartup") }}
    </button>
  </main>
</template>

<style scoped>
.startup-failure {
  display: grid;
  justify-items: start;
  align-content: center;
  gap: 16px;
  min-height: 100dvh;
  padding: 32px;
  color: var(--text-primary);
  background: var(--surface-main);
}
.startup-failure button {
  border: 1px solid var(--text-primary);
  border-radius: 8px;
  padding: 8px 16px;
  color: var(--surface-main);
  background: var(--text-primary);
  cursor: pointer;
}
</style>
