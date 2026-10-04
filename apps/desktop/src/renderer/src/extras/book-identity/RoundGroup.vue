<script setup lang="ts">
import { ref } from "vue";
import type { BookIdentityRound } from "@deepwrite/contracts/renderer";
import { identityT as t } from "./book-identity-utils";
defineProps<{
  round: BookIdentityRound;
  protected: boolean;
  disabled: boolean;
  saving?: boolean;
}>();
defineEmits<{ remove: [] }>();
const collapsed = ref(false);
</script>
<template>
  <section class="identity-round">
    <header class="identity-row">
      <div>
        <strong>{{ new Date(round.createdAt).toLocaleString() }}</strong
        ><small class="identity-muted">
          ·
          {{
            round.source === "manual"
              ? t("manualRound")
              : t("sourceProfile", { name: round.profile?.name ?? "" })
          }}
          · {{ round.model?.label }}</small
        >
        <p v-if="round.request.brief" class="identity-muted">
          {{ round.request.brief }}
        </p>
      </div>
      <div class="identity-actions">
        <button @click="collapsed = !collapsed">
          {{ collapsed ? t("expand") : t("collapse") }}</button
        ><button
          class="identity-danger"
          :class="{
            'identity-save-pending': saving && !protected && !disabled
          }"
          :disabled="protected || disabled || saving"
          :aria-busy="saving && !protected && !disabled"
          :title="protected ? t('adoptedProtected') : undefined"
          @click="$emit('remove')"
        >
          {{ t("deleteRound") }}
        </button>
      </div>
    </header>
    <div v-if="!collapsed" class="identity-candidate-grid"><slot /></div>
  </section>
</template>
<style scoped src="./book-identity.css"></style>
