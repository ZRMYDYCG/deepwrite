import { formatError } from "../i18n/errors";
import { createScopedTranslator } from "../i18n";
import { computed, ref, shallowRef, watch } from "vue";
import { useConversationStore } from "../stores/conversationStore";
import { uiMessage } from "../ui-feedback";
import type { ConversationHistoryItem } from "../types/conversation";

const t = createScopedTranslator("workspace.conversationHistoryManagement");

export interface ConversationHistoryManagementPort {
  historyManagementAvailable: boolean;
  listDeletedConversations(): Promise<ConversationHistoryItem[]>;
  deleteConversation(sessionId: string): Promise<boolean>;
  restoreConversation(sessionId: string): Promise<boolean>;
}

export function createConversationHistoryManagement(options: {
  owner: () => ConversationHistoryManagementPort | undefined;
  notify: (kind: "success" | "error" | "info", text: string) => void;
}) {
  const deletedItems = shallowRef<ConversationHistoryItem[]>([]);
  const loading = ref(false);
  const busy = ref(false);
  const available = computed(
    () => !!options.owner()?.historyManagementAvailable
  );
  let loadIntent = 0;

  watch(options.owner, () => {
    loadIntent += 1;
    deletedItems.value = [];
    loading.value = false;
  });

  async function refreshDeleted(): Promise<void> {
    const owner = options.owner();
    if (!owner?.historyManagementAvailable) return;
    const intent = ++loadIntent;
    loading.value = true;
    try {
      const items = await owner.listDeletedConversations();
      if (intent === loadIntent && owner === options.owner())
        deletedItems.value = items;
    } catch (error) {
      if (intent === loadIntent)
        options.notify(
          "error",
          formatError(
            error,
            t("deletedConversationsCouldNotBeLoadedPleaseTryAgain")
          )
        );
    } finally {
      if (intent === loadIntent) loading.value = false;
    }
  }

  async function mutate(
    item: ConversationHistoryItem,
    deleted: boolean
  ): Promise<boolean> {
    const owner = options.owner();
    if (!owner?.historyManagementAvailable || busy.value) return false;
    busy.value = true;
    try {
      const saved = await (deleted
        ? owner.deleteConversation(item.sessionId)
        : owner.restoreConversation(item.sessionId));
      if (!saved) {
        options.notify(
          "info",
          t("finishOrStopTheCurrentResponseBeforeManagingConversations")
        );
        return false;
      }
      if (owner === options.owner()) await refreshDeleted();
      options.notify(
        "success",
        deleted
          ? t("conversationMovedToDeletedYouCanRestoreItAt")
          : t("conversationRestored")
      );
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

  return {
    available,
    deletedItems,
    loading,
    busy,
    refreshDeleted,
    deleteConversation: (item: ConversationHistoryItem) => mutate(item, true),
    restoreConversation: (item: ConversationHistoryItem) => mutate(item, false)
  };
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
