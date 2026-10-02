<script setup lang="ts">
import { t } from "../i18n";
import { computed } from "vue";
import type { LongWorkspaceIndexSnapshot } from "@deepwrite/contracts";
import type { LongWorkspaceProposalItem } from "../composables/useLongWorkspaceProposals";
import type { ChatMessage } from "../types/conversation";
import {
  conversationTimelineBlocks,
  timelineProcessingLabel
} from "./conversationTimelineBlocks";
import AppIcon from "./AppIcon.vue";
import ConversationContextCompactionNotice from "./ConversationContextCompactionNotice.vue";
import ConversationDetails from "./ConversationDetails.vue";
import ConversationRunClock from "./ConversationRunClock.vue";
import ConversationProcessingItem from "./ConversationProcessingItem.vue";
import ConversationWorkGroup from "./ConversationWorkGroup.vue";
import StreamedContent from "./StreamedContent.vue";
import SubagentRunList from "./SubagentRunList.vue";

const props = withDefaults(
  defineProps<{
    message: ChatMessage;
    allowLiveEditReview?: boolean;
    longProposalItems?: readonly LongWorkspaceProposalItem[];
    longWorkspaceIndex?: LongWorkspaceIndexSnapshot | null;
  }>(),
  {
    allowLiveEditReview: false,
    longProposalItems: () => [],
    longWorkspaceIndex: null
  }
);

const blocks = computed(() =>
  conversationTimelineBlocks(props.message, props.longProposalItems)
);

const emit = defineEmits<{
  reviewEdit: [
    payload: {
      runId: string;
      proposalId: string;
      decision: "accept" | "reject";
    }
  ];
  locateEditProposal: [payload: { runId: string; proposalId: string }];
  discardEditProposal: [payload: { runId: string; proposalId: string }];
  approveLongProposal: [eventId: string];
  rejectLongProposal: [eventId: string];
  retryLongProposalPreview: [eventId: string];
  locateLongProposal: [eventId: string];
}>();
</script>

<template>
  <template v-for="block in blocks" :key="block.id">
    <div
      v-if="block.kind === 'processing' && block.live"
      class="processing-live-list"
      :aria-label="t('components.conversationProcessingTimeline.execution')"
    >
      <div class="processing-live-status" aria-live="off">
        <ConversationRunClock
          v-slot="{ now }"
          :active="message.status === 'streaming' || Boolean(message.retry)"
        >
          {{ timelineProcessingLabel(message, block, now) }}
        </ConversationRunClock>
      </div>
      <template v-for="item in block.items" :key="item.id">
        <ConversationWorkGroup
          v-if="item.type === 'work-group'"
          :item="item"
          streaming
        />
        <SubagentRunList
          v-else-if="item.type === 'subagent'"
          :message="message"
          :runs="item.runs"
        />
        <ConversationProcessingItem
          v-else
          :item="item"
          streaming
          :message-status="message.status"
          :allow-live-edit-review="allowLiveEditReview"
          :long-workspace-index="longWorkspaceIndex"
          @review-edit="emit('reviewEdit', $event)"
          @locate-edit-proposal="emit('locateEditProposal', $event)"
          @discard-edit-proposal="emit('discardEditProposal', $event)"
          @approve-long-proposal="emit('approveLongProposal', $event)"
          @reject-long-proposal="emit('rejectLongProposal', $event)"
          @retry-long-proposal-preview="
            emit('retryLongProposalPreview', $event)
          "
          @locate-long-proposal="emit('locateLongProposal', $event)"
        />
      </template>
    </div>

    <ConversationDetails
      v-else-if="block.kind === 'processing'"
      :detail-id="
        block.id === `processing:${message.id}`
          ? `${message.id}:processing`
          : `${message.id}:${block.id}`
      "
      class="processing-block"
    >
      <template #summary>
        <span
          ><ConversationRunClock v-slot="{ now }" :active="false">
            {{ timelineProcessingLabel(message, block, now) }}
          </ConversationRunClock></span
        >
        <AppIcon name="chevron" :size="13" />
      </template>
      <div class="processing-content">
        <template v-for="item in block.items" :key="item.id">
          <ConversationWorkGroup
            v-if="item.type === 'work-group'"
            :item="item"
            :streaming="false"
          />
          <SubagentRunList
            v-else-if="item.type === 'subagent'"
            :message="message"
            :runs="item.runs"
          />
          <ConversationProcessingItem
            v-else
            :item="item"
            :streaming="false"
            :message-status="message.status"
            :allow-live-edit-review="allowLiveEditReview"
            :long-workspace-index="longWorkspaceIndex"
            @review-edit="emit('reviewEdit', $event)"
            @locate-edit-proposal="emit('locateEditProposal', $event)"
            @discard-edit-proposal="emit('discardEditProposal', $event)"
            @approve-long-proposal="emit('approveLongProposal', $event)"
            @reject-long-proposal="emit('rejectLongProposal', $event)"
            @retry-long-proposal-preview="
              emit('retryLongProposalPreview', $event)
            "
            @locate-long-proposal="emit('locateLongProposal', $event)"
          />
        </template>
      </div>
    </ConversationDetails>

    <ConversationContextCompactionNotice
      v-else-if="block.kind === 'compaction'"
      :compactions="[block.item.compaction]"
    />

    <div
      v-else
      class="timeline-response message-copy"
      :class="{ 'is-streaming': block.live }"
    >
      <StreamedContent
        :content="block.item.content"
        format="markdown"
        :streaming="block.live"
      />
    </div>
  </template>
</template>

<style scoped>
.timeline-response {
  margin-bottom: 20px;
}
</style>
