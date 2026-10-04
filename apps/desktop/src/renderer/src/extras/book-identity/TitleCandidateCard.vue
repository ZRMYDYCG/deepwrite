<script setup lang="ts">
import type { BookTitleCandidate } from "@deepwrite/contracts/renderer";
import { ref } from "vue";
import CandidateActions from "./CandidateActions.vue";
import { identityT as t } from "./book-identity-utils";
import { uiMessage } from "../../ui-feedback";
const props = defineProps<{
  candidate: BookTitleCandidate;
  manual: boolean;
  adopted: boolean;
  disabled: boolean;
  saving?: boolean;
}>();
defineEmits<{ star: []; edit: []; adopt: []; iterate: [] }>();
const expanded = ref(false);
async function copy() {
  try {
    await navigator.clipboard.writeText(
      [props.candidate.title, props.candidate.subtitle]
        .filter(Boolean)
        .join("\n")
    );
    uiMessage.success(t("copied"));
  } catch {
    uiMessage.error(t("failed"));
  }
}
</script>
<template>
  <article class="identity-candidate">
    <div class="identity-row">
      <span class="identity-tag">{{ candidate.angle }}</span
      ><small v-if="manual">{{ t("manual") }}</small>
    </div>
    <h3 class="identity-candidate-title">{{ candidate.title }}</h3>
    <p v-if="candidate.subtitle">{{ candidate.subtitle }}</p>
    <p class="identity-rationale" :class="{ 'identity-clamp': !expanded }">
      {{ candidate.rationale }}
    </p>
    <div class="identity-row">
      <small>{{ candidate.keywords.join(" · ") }}</small>
      <button class="identity-link" @click="expanded = !expanded">
        {{ expanded ? t("collapse") : t("expand") }}
      </button>
    </div>
    <CandidateActions
      :starred="candidate.starred"
      :adopted="adopted"
      :disabled="disabled"
      :saving="saving"
      @star="$emit('star')"
      @edit="$emit('edit')"
      @adopt="$emit('adopt')"
      @copy="copy"
      @iterate="$emit('iterate')"
    />
  </article>
</template>
<style scoped src="./book-identity.css"></style>
