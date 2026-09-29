<script setup lang="ts">
import { syncIssueText, syncIssueTitle } from "./displayText";
import { createScopedTranslator } from "../../i18n";
import type {
  SyncAdoptionSide,
  SyncIssue
} from "@deepwrite/contracts/renderer";
import SyncAdoptionButtons from "./SyncAdoptionButtons.vue";

const t = createScopedTranslator("extras.deviceSync");
defineProps<{ issue: SyncIssue; pending: boolean }>();
const emit = defineEmits<{ resolve: [side: SyncAdoptionSide] }>();
</script>
<template>
  <section class="sync-card">
    <h3>{{ syncIssueTitle(issue) }}</h3>
    <p>{{ syncIssueText(issue) }}</p>
    <p v-if="issue.paths.length">
      {{ t("affectedFiles", { files: issue.paths.join("、") }) }}
    </p>
    <template v-if="issue.reason === 'conflict' || issue.reason === 'delete'">
      <p
        v-if="
          issue.local &&
          issue.versions.length > 0 &&
          issue.versions.every((version) => version.item === null)
        "
      >
        {{ t("remoteDeletionHelp") }}
      </p>
      <div class="sync-actions">
        <SyncAdoptionButtons
          :title="issue.title"
          :pending="pending"
          @resolve="(side) => emit('resolve', side)"
        />
      </div>
    </template>
  </section>
</template>
