<script setup lang="ts">
import { identityT as t } from "./book-identity-utils";
import IdentityAdoptButton from "./IdentityAdoptButton.vue";
defineProps<{
  starred: boolean;
  adopted?: boolean;
  disabled?: boolean;
  saving?: boolean;
}>();
defineEmits<{ star: []; edit: []; copy: []; adopt: []; iterate: [] }>();
</script>
<template>
  <div
    class="identity-actions"
    :class="{ 'identity-save-pending': saving && !disabled }"
    :aria-busy="saving"
  >
    <button
      :disabled="disabled || saving"
      :aria-pressed="starred"
      @click="$emit('star')"
    >
      {{ starred ? t("unstar") : t("star") }}</button
    ><button :disabled="disabled || saving" @click="$emit('edit')">
      {{ t("edit") }}</button
    ><button @click="$emit('copy')">{{ t("copy") }}</button
    ><IdentityAdoptButton
      :adopted="!!adopted"
      :disabled="disabled"
      :saving="saving"
      @adopt="$emit('adopt')"
    /><button @click="$emit('iterate')">{{ t("iterate") }}</button>
  </div>
</template>
<style scoped src="./book-identity.css"></style>
