<script setup lang="ts">
import type {
  BookIdentityCandidate,
  BookIdentityField
} from "@deepwrite/contracts/renderer";
import {
  candidateLabel,
  fieldLabel,
  identityT as t
} from "./book-identity-utils";
defineProps<{
  field: BookIdentityField;
  profileName: string;
  count: number;
  disabled: boolean;
  saving?: boolean;
  busy: boolean;
  seeds: readonly BookIdentityCandidate[];
  imageReady: boolean;
  imageName: string;
  images: number;
  autoRender: boolean;
}>();
defineEmits<{
  start: [];
  stop: [];
  removeSeed: [id: string];
}>();
</script>
<template>
  <section class="analysis-card identity-generation">
    <div class="identity-row">
      <div class="identity-generation-summary">
        <strong>{{ fieldLabel(field) }}</strong>
        <span>{{ t("generationSummary", { name: profileName, count }) }}</span>
      </div>
      <button v-if="busy" @click="$emit('stop')">{{ t("stop") }}</button>
      <button
        v-else
        class="analysis-primary-button"
        :class="{
          'identity-save-pending':
            saving &&
            !disabled &&
            (field !== 'cover' || imageReady || !autoRender)
        }"
        :aria-busy="saving"
        :disabled="
          disabled || saving || (field === 'cover' && !imageReady && autoRender)
        "
        @click="$emit('start')"
      >
        {{ t("generate", { count }) }}
      </button>
    </div>
    <small v-if="field === 'cover'" class="identity-muted">
      {{
        autoRender
          ? t("estimate", { plans: count, images, total: count * images })
          : t("plansOnly")
      }}
      · {{ imageName }}
    </small>
    <div v-if="seeds.length" class="identity-seeds">
      <small>{{ t("references") }}</small>
      <button
        v-for="seed in seeds"
        :key="seed.id"
        :disabled="busy"
        @click="$emit('removeSeed', seed.id)"
      >
        {{ candidateLabel(seed) }} ×
      </button>
    </div>
    <slot />
  </section>
</template>
<style scoped>
.identity-generation-summary {
  display: grid;
  gap: 6px;
  min-width: 0;
  flex: 1 1 220px;
}
.identity-generation-summary strong {
  font-size: 1.05em;
}
.identity-generation-summary span {
  color: var(--text-secondary);
  font-size: 0.9em;
  overflow-wrap: anywhere;
}
</style>
