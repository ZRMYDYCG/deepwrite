import { formatError } from "../i18n/errors";
import { createScopedTranslator } from "../i18n";
import { computed, ref } from "vue";
import { useConversationStore } from "../stores/conversationStore";
import { uiMessage } from "../ui-feedback";
import type { ConversationHistoryItem } from "../types/conversation";

const t = createScopedTranslator("workspace.conversationHistoryManagement");

export interface ConversationHistoryManagementPort {
  historyManagementAvailable: boolean;
  /** The existing durable soft-delete operation now represents archiving. */
  deleteConversation(sessionId: string): Promise<boolean>;
}

export function createConversationHistoryManagement(options: {
  owner: () => ConversationHistoryManagementPort | undefined;
  notify: (kind: "success" | "error" | "info", text: string) => void;
}) {
  const busy = ref(false);
  const available = computed(
    () => !!options.owner()?.historyManagementAvailable
  );

  async function archiveConversation(
    item: ConversationHistoryItem
  ): Promise<boolean> {
    const owner = options.owner();
    if (!owner?.historyManagementAvailable || busy.value) return false;
    busy.value = true;
    try {
      const saved = await owner.deleteConversation(item.sessionId);
      if (!saved) {
        options.notify(
          "info",
          t("finishOrStopTheCurrentResponseBeforeManagingConversations")
        );
        return false;
      }
      options.notify("success", t("conversationArchived"));
      return true;
    } catch (error) {
      options.notify(
        "error",
        formatError(
          error,
          t("theConversationOperationDidNotCompletePleaseTryAgain")
        )
      );
      return false;
    } finally {
      busy.value = false;
    }
  }

  return { available, busy, archiveConversation };
}

export function useConversationHistoryManagement(sessionId: () => string) {
  const store = useConversationStore();
  const owner = computed(() => {
    for (const controller of store.controllers.values()) {
      if (controller.sessionId.value !== sessionId()) continue;
      if (controller.historyManagementAvailable) return controller;
    }
    return undefined;
  });
  return createConversationHistoryManagement({
    owner: () => owner.value,
    notify: (kind, text) => uiMessage[kind](text)
  });
}
