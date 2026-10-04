<script setup lang="ts">
import { identityT as t } from "./book-identity-utils";
defineProps<{ adopted: boolean; disabled?: boolean; saving?: boolean }>();
defineEmits<{ adopt: [] }>();
</script>
<template>
  <button
    class="identity-adopt"
    :class="{ 'identity-save-pending': saving && !disabled }"
    :disabled="disabled || saving"
    :aria-pressed="adopted"
    :aria-busy="saving"
    @click="$emit('adopt')"
  >
    <span
      v-for="label in [t('adopt'), t('adopted')]"
      :key="label"
      class="identity-adopt-sizer"
      aria-hidden="true"
      >{{ label }}</span
    >
    <span>{{ adopted ? t("adopted") : t("adopt") }}</span>
  </button>
</template>
<style scoped>
.identity-adopt {
  display: inline-grid;
}
.identity-adopt > span {
  grid-area: 1 / 1;
}
.identity-adopt-sizer {
  visibility: hidden;
}
</style>
