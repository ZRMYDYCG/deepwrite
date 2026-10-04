<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { computed } from "vue";
import {
  subagentRunDetailId,
  type AgentSubagentRun
} from "../types/conversation";
import {
  subagentProcessingDisplayItems,
  subagentRetryStatus,
  type SubagentProcessingDisplayItem
} from "./subagentRunPresentation";
import ConversationRunClock from "./ConversationRunClock.vue";
import ConversationWorkGroup from "./ConversationWorkGroup.vue";
import StreamedContent from "./StreamedContent.vue";

const t = createScopedTranslator("components.subagentRunList");

const props = defineProps<{ run: AgentSubagentRun }>();

// Built once per change, reusing unchanged groups so a streaming child only
// re-renders the part that grew.
const items = computed<SubagentProcessingDisplayItem[]>((previous) =>
  subagentProcessingDisplayItems(props.run, previous)
);
</script>

<template>
  <div class="subagent-run-detail">
    <section class="subagent-run-handoff subagent-run-assigned-task">
      <strong>{{ t("taskAssignedByPrimaryAgent") }}</strong>
      <p>{{ run.task }}</p>
    </section>
    <ConversationRunClock v-slot="{ now }" :active="run.status === 'running'">
      <div v-if="subagentRetryStatus(run, now)" class="subagent-run-waiting">
        {{ subagentRetryStatus(run, now) }}
      </div>
    </ConversationRunClock>
    <div
      v-if="items.length"
      class="subagent-processing-list"
      :aria-label="t('subagentExecution')"
    >
      <template v-for="item in items" :key="item.id">
        <ConversationWorkGroup
          v-if="item.type === 'work-group'"
          :item="item"
          :streaming="run.status === 'running'"
          :detail-id-prefix="subagentRunDetailId(run)"
        />
        <div
          v-else-if="item.type === 'response'"
          class="processing-step processing-response subagent-processing-response"
        >
          <StreamedContent
            :content="item.content"
            format="markdown"
            :streaming="run.status === 'running'"
          />
        </div>
      </template>
    </div>
    <div v-else-if="run.status === 'running'" class="subagent-run-waiting">
      {{ t("startingIndependentContextAndReceivingEvents") }}
    </div>

    <section
      v-if="run.summary || run.errorMessage"
      class="subagent-run-handoff"
      :class="{ 'is-error': run.status === 'error' }"
    >
      <strong>{{
        run.status === "completed" ? t("handoffSummary") : t("completionNotes")
      }}</strong>
      <StreamedContent
        v-if="run.summary"
        :content="run.summary"
        format="markdown"
      />
      <p v-if="run.errorMessage && !run.summary?.includes(run.errorMessage)">
        {{ run.errorMessage }}
      </p>
    </section>
  </div>
</template>
