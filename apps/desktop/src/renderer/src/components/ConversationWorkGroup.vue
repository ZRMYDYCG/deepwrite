<script setup lang="ts">
import { workGroupActivityLabel } from "./conversationActivityLabel";
import type { WorkGroupDisplayItem } from "./conversationWorkGroups";
import AppIcon from "./AppIcon.vue";
import ConversationDetails from "./ConversationDetails.vue";
import ConversationContextCompactionNotice from "./ConversationContextCompactionNotice.vue";
import ConversationProcessingItem from "./ConversationProcessingItem.vue";

withDefaults(
  defineProps<{
    item: WorkGroupDisplayItem;
    streaming: boolean;
    detailIdPrefix?: string;
  }>(),
  { detailIdPrefix: "" }
);

function detailId(id: string, prefix: string): string {
  return prefix ? `${prefix}:${id}` : id;
}
</script>

<template>
  <ConversationDetails
    :detail-id="detailId(item.id, detailIdPrefix)"
    class="processing-live-item processing-live-thinking processing-work-group"
    :aria-busy="item.running"
  >
    <template #summary>
      <span :class="{ 'is-processing-shimmer': item.running }">{{
        workGroupActivityLabel(item)
      }}</span>
      <AppIcon name="chevron" :size="13" />
    </template>
    <div class="processing-work-group-body">
      <template v-for="member in item.items" :key="member.id">
        <ConversationContextCompactionNotice
          v-if="member.type === 'compaction'"
          :compactions="[member.compaction]"
        />
        <ConversationProcessingItem
          v-else
          :item="member"
          :streaming="streaming && item.running"
          :detail-id-prefix="detailIdPrefix"
        />
      </template>
    </div>
  </ConversationDetails>
</template>

<style scoped>
/* Align status icons with the group heading while keeping details indented. */
.processing-work-group-body > :deep(.processing-live-thinking > summary) {
  margin-left: -16px;
}
</style>
