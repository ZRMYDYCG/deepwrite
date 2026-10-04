<script setup lang="ts">
import type { BookSynopsisCandidate } from "@deepwrite/contracts/renderer";
import { ref } from "vue";
import CandidateActions from "./CandidateActions.vue";
import { identityT as t } from "./book-identity-utils";
import { uiMessage } from "../../ui-feedback";
const props = defineProps<{
  candidate: BookSynopsisCandidate;
  manual: boolean;
  adopted: boolean;
  disabled: boolean;
  saving?: boolean;
}>();
defineEmits<{ star: []; edit: []; adopt: []; iterate: [] }>();
const expanded = ref(false);
async function copy() {
  try {
    await navigator.clipboard.writeText(props.candidate.text);
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
    <h3 v-if="candidate.hook">{{ candidate.hook }}</h3>
    <p class="identity-synopsis" :class="{ 'identity-clamp': !expanded }">
      {{ candidate.text }}
    </p>
    <div class="identity-row">
      <small>{{ t("chars", { count: candidate.wordCount }) }}</small
      ><button class="identity-link" @click="expanded = !expanded">
        {{ expanded ? t("collapse") : t("expand") }}
      </button>
    </div>
    <details>
      <summary>{{ t("rationale") }}</summary>
      <p>{{ candidate.rationale }}</p>
    </details>
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
