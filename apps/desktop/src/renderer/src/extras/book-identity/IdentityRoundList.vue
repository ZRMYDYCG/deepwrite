<script setup lang="ts">
import type {
  BookIdentityCandidate,
  BookIdentityRound,
  BookCoverCandidate,
  ChatAssistantProjectRef,
  CoverImageRef
} from "@deepwrite/contracts/renderer";
import type { BookIdentityController } from "./useBookIdentity";
import { useCoverRenderQueue } from "./useCoverRenderQueue";
import RoundGroup from "./RoundGroup.vue";
import TitleCandidateCard from "./TitleCandidateCard.vue";
import SynopsisCandidateCard from "./SynopsisCandidateCard.vue";
import CoverCandidateCard from "./CoverCandidateCard.vue";
const props = defineProps<{
  controller: BookIdentityController;
  book: ChatAssistantProjectRef;
  rounds: readonly BookIdentityRound[];
  starredOnly: boolean;
}>();
const emit = defineEmits<{
  edit: [round: BookIdentityRound, candidate: BookIdentityCandidate];
  iterate: [candidate: BookIdentityCandidate];
  render: [round: BookIdentityRound, candidate: BookCoverCandidate];
  compose: [
    round: BookIdentityRound,
    candidate: BookCoverCandidate,
    image: CoverImageRef
  ];
  export: [
    round: BookIdentityRound,
    candidate: BookCoverCandidate,
    imageId: string
  ];
}>();
const c = props.controller;
const record = c.record;
const writable = c.writable;
const queue = useCoverRenderQueue();
function visibleCandidate(candidate: BookIdentityCandidate) {
  return !props.starredOnly || candidate.starred;
}
function hasAdopted(candidate: BookIdentityCandidate) {
  return Object.values(record.value?.adopted ?? {}).some(
    (a) => a?.candidateId === candidate.id
  );
}
</script>
<template>
  <RoundGroup
    v-for="round in rounds"
    :key="round.id"
    :round="round"
    :protected="c.protectedRound(round)"
    :disabled="!writable"
    :saving="c.saving.value"
    @remove="c.remove(round)"
  >
    <template v-if="round.field === 'title'"
      ><TitleCandidateCard
        v-for="candidate in round.candidates.filter(visibleCandidate)"
        :key="candidate.id"
        :candidate="candidate"
        :manual="round.source === 'manual'"
        :adopted="hasAdopted(candidate)"
        :disabled="!writable"
        :saving="c.saving.value"
        @star="
          c.update(round.id, candidate.id, { starred: !candidate.starred })
        "
        @edit="emit('edit', round, candidate)"
        @adopt="c.adopt(round, candidate)"
        @iterate="emit('iterate', candidate)"
    /></template>
    <template v-else-if="round.field === 'synopsis'"
      ><SynopsisCandidateCard
        v-for="candidate in round.candidates.filter(visibleCandidate)"
        :key="candidate.id"
        :candidate="candidate"
        :manual="round.source === 'manual'"
        :adopted="hasAdopted(candidate)"
        :disabled="!writable"
        :saving="c.saving.value"
        @star="
          c.update(round.id, candidate.id, { starred: !candidate.starred })
        "
        @edit="emit('edit', round, candidate)"
        @adopt="c.adopt(round, candidate)"
        @iterate="emit('iterate', candidate)"
    /></template>
    <template v-else
      ><CoverCandidateCard
        v-for="candidate in round.candidates.filter(visibleCandidate)"
        :key="candidate.id"
        :candidate="candidate"
        :book="book"
        :busy="queue.busy(book, candidate.id)"
        :disabled="!writable"
        :saving="c.saving.value"
        :adopted-image-id="record?.adopted.cover?.imageId"
        @star="
          c.update(round.id, candidate.id, { starred: !candidate.starred })
        "
        @edit="emit('edit', round, candidate)"
        @render="emit('render', round, candidate)"
        @compose="emit('compose', round, candidate, $event)"
        @adopt="c.adopt(round, candidate, $event)"
        @iterate="emit('iterate', candidate)"
        @export="emit('export', round, candidate, $event)"
    /></template>
  </RoundGroup>
</template>
