import { identityApi } from "./book-identity-utils";
import { computed, reactive, watch } from "vue";
import { bookIdentityImageRunning } from "../../stores/bookIdentityActivity";
import { createId } from "@deepwrite/shared";
import {
  chatAssistantProjectKey,
  type ChatAssistantProjectRef,
  type BookIdentityCoverRound
} from "@deepwrite/contracts/renderer";
import { formatError } from "../../i18n/errors";
import { uiMessage } from "../../ui-feedback";
import { identityT as t } from "./book-identity-utils";
interface QueueItem {
  requestId: string;
  book: ChatAssistantProjectRef;
  roundId: string;
  candidateId: string;
  state: "queued" | "running";
}
const items = reactive<QueueItem[]>([]);
watch(
  () => items.length,
  (count) => {
    bookIdentityImageRunning.value = count > 0;
  },
  { flush: "sync", immediate: true }
);
let pumping = false;
function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (items.filter((i) => i.state === "running").length < 2) {
      const item = items.find((i) => i.state === "queued");
      if (!item) break;
      item.state = "running";
      void identityApi()
        .bookIdentity.renderCover({
          requestId: item.requestId,
          book: { ...item.book },
          roundId: item.roundId,
          candidateId: item.candidateId
        })
        .catch((error) => {
          uiMessage.error(formatError(error, t("failed")));
        })
        .finally(() => {
          const index = items.findIndex((i) => i.requestId === item.requestId);
          if (index >= 0) items.splice(index, 1);
          pump();
        });
    }
  } finally {
    pumping = false;
  }
}
export function useCoverRenderQueue() {
  function add(
    book: ChatAssistantProjectRef,
    roundId: string,
    candidateId: string,
    count = 1
  ) {
    for (let i = 0; i < count; i++)
      items.push({
        requestId: createId("cover_render"),
        book: { ...book },
        roundId,
        candidateId,
        state: "queued"
      });
    pump();
  }
  function addRound(
    book: ChatAssistantProjectRef,
    round: BookIdentityCoverRound
  ) {
    for (const candidate of round.candidates)
      add(book, round.id, candidate.id, round.request.imagesPerCandidate);
  }
  async function stop(book: ChatAssistantProjectRef) {
    const key = chatAssistantProjectKey(book);
    const running = items.filter(
      (i) => chatAssistantProjectKey(i.book) === key && i.state === "running"
    );
    for (let i = items.length - 1; i >= 0; i--)
      if (
        chatAssistantProjectKey(items[i]!.book) === key &&
        items[i]!.state === "queued"
      )
        items.splice(i, 1);
    await Promise.allSettled(
      running.map((i) =>
        identityApi().bookIdentity.cancelRender({ requestId: i.requestId })
      )
    );
  }
  function pendingFor(book: ChatAssistantProjectRef) {
    return items.filter(
      (i) => chatAssistantProjectKey(i.book) === chatAssistantProjectKey(book)
    ).length;
  }
  function busy(book: ChatAssistantProjectRef, candidateId: string) {
    return items.some(
      (i) =>
        chatAssistantProjectKey(i.book) === chatAssistantProjectKey(book) &&
        i.candidateId === candidateId
    );
  }
  return {
    items,
    pending: computed(() => items.length),
    add,
    addRound,
    stop,
    busy,
    pendingFor
  };
}
