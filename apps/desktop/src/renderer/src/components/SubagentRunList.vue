<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { computed } from "vue";
import type { AgentSubagentRun, ChatMessage } from "../types/conversation";
import {
  subagentDuration,
  subagentProcessingDisplayItems,
  subagentRetryProgress,
  subagentRetryStatus,
  subagentReviewHint,
  subagentStatusLabel,
  subagentUsageLabel
} from "./subagentRunPresentation";
import AppIcon from "./AppIcon.vue";
import ConversationDetails from "./ConversationDetails.vue";
import ConversationRunClock from "./ConversationRunClock.vue";
import ConversationWorkGroup from "./ConversationWorkGroup.vue";
import StreamedContent from "./StreamedContent.vue";

const t = createScopedTranslator("components.subagentRunList");

const props = defineProps<{
  message: ChatMessage;
  runs?: AgentSubagentRun[];
}>();

const runs = computed(() => props.runs ?? props.message.subagentRuns ?? []);
</script>

<template>
  <section
    v-if="runs.length"
    class="subagent-run-list"
    :aria-label="t('subagentRuns')"
  >
    <ConversationDetails
      v-for="run in runs"
      :key="run.parentToolCallId"
      :detail-id="run.parentToolCallId"
      class="subagent-run-card"
      :class="`is-${run.status}`"
      :aria-busy="run.status === 'running'"
    >
      <template #summary>
        <span class="subagent-run-icon" aria-hidden="true">
          <AppIcon name="user" :size="17" />
        </span>
        <span class="subagent-run-heading">
          <span class="subagent-run-title-row">
            <strong>{{ run.name }}</strong>
            <span class="subagent-run-status" :class="`is-${run.status}`">
              <ConversationRunClock
                v-slot="{ now }"
                :active="run.status === 'running'"
              >
                {{ subagentStatusLabel(run, now) }}
              </ConversationRunClock>
            </span>
          </span>
          <span class="subagent-run-task">{{ run.task }}</span>
        </span>
        <span class="subagent-run-meta" :aria-label="t('subtaskSummary')">
          <ConversationRunClock
            v-slot="{ now }"
            :active="run.status === 'running'"
          >
            <span v-if="subagentDuration(run, now)">{{
              subagentDuration(run, now)
            }}</span>
          </ConversationRunClock>
          <span v-if="subagentRetryProgress(run)">{{
            subagentRetryProgress(run)
          }}</span>
          <span>{{
            t("toolsMessage", {
              arg0: run.toolCalls.length ?? ""
            })
          }}</span>
          <span
            v-if="subagentUsageLabel(run)"
            :aria-label="t('subagentTokenUsage')"
          >
            {{ subagentUsageLabel(run) }}
          </span>
          <span v-if="subagentReviewHint(message, run)" class="is-review">
            {{ subagentReviewHint(message, run) }}
          </span>
        </span>
        <AppIcon class="subagent-run-chevron" name="chevron" :size="14" />
      </template>

      <div class="subagent-run-detail">
        <section class="subagent-run-handoff subagent-run-assigned-task">
          <strong>{{ t("taskAssignedByPrimaryAgent") }}</strong>
          <p>{{ run.task }}</p>
        </section>
        <ConversationRunClock
          v-slot="{ now }"
          :active="run.status === 'running'"
        >
          <div
            v-if="subagentRetryStatus(run, now)"
            class="subagent-run-waiting"
          >
            {{ subagentRetryStatus(run, now) }}
          </div>
        </ConversationRunClock>
        <div
          v-if="subagentProcessingDisplayItems(run).length"
          class="subagent-processing-list"
          :aria-label="t('subagentExecution')"
        >
          <template
            v-for="item in subagentProcessingDisplayItems(run)"
            :key="item.id"
          >
            <ConversationWorkGroup
              v-if="item.type === 'work-group'"
              :item="item"
              :streaming="run.status === 'running'"
              :detail-id-prefix="run.parentToolCallId"
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
            run.status === "completed"
              ? t("handoffSummary")
              : t("completionNotes")
          }}</strong>
          <StreamedContent
            v-if="run.summary"
            :content="run.summary"
            format="markdown"
          />
          <p
            v-if="run.errorMessage && !run.summary?.includes(run.errorMessage)"
          >
            {{ run.errorMessage }}
          </p>
        </section>
      </div>
    </ConversationDetails>
  </section>
</template>
