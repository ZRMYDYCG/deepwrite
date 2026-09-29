<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { computed } from "vue";
import type { LongWorkspaceImpactConfirmation } from "@deepwrite/contracts";
import { longImpactConfirmationLines } from "../utils/longImpactConfirmation";

const t = createScopedTranslator("components.longImpactConfirmationDetails");

const props = withDefaults(
  defineProps<{
    confirmation: LongWorkspaceImpactConfirmation;
    fallback?: string;
    open?: boolean;
  }>(),
  {
    fallback: "",
    open: true
  }
);

const lines = computed(() => longImpactConfirmationLines(props.confirmation));
const summary = computed(() => {
  const entityCount = props.confirmation.entityChanges.length;
  const relationshipCount = props.confirmation.relationshipChanges.length;
  const fileCount = props.confirmation.fileIntents.length;
  const ledgerCount = props.confirmation.ledgerRecordEdits.length;
  return [
    entityCount
      ? t("valueEntityChanges", {
          arg0: entityCount
        })
      : "",
    relationshipCount
      ? t("valueLinkChanges", {
          arg0: relationshipCount
        })
      : "",
    fileCount
      ? t("valueFileChanges", {
          arg0: fileCount
        })
      : "",
    ledgerCount
      ? t("valueContinuityRecordAdjustments", { arg0: ledgerCount })
      : ""
  ]
    .filter(Boolean)
    .join("、");
});
</script>

<template>
  <section class="long-impact-confirmation" :aria-label="t('exactImpact')">
    <p>
      {{ summary || fallback || t("thisOperationHasNoAdditionalLinkImpact") }}
    </p>
    <details v-if="lines.length" :open="open">
      <summary>
        {{
          t("viewExactImpactMessage", {
            arg0: lines.length ?? ""
          })
        }}
      </summary>
      <ul>
        <li v-for="(line, index) in lines" :key="`${index}:${line}`">
          {{ line }}
        </li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
.long-impact-confirmation {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
  padding: 0.75rem;
  border: 1px solid var(--theme-line);
  border-radius: 0.65rem;
  background: var(--surface-muted);
  color: var(--text-secondary);
  line-height: 1.5;
}

.long-impact-confirmation p {
  margin: 0;
  color: var(--text-primary);
  font-weight: 600;
}

.long-impact-confirmation summary {
  color: var(--text-secondary);
  cursor: pointer;
}

.long-impact-confirmation ul {
  display: grid;
  gap: 0.35rem;
  max-height: 12rem;
  margin: 0.5rem 0 0;
  padding: 0 0 0 1.25rem;
  overflow: auto;
  color: var(--text-tertiary);
  overflow-wrap: anywhere;
}
</style>
