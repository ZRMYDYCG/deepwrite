import type { ConversationHistoryApi } from "@deepwrite/contracts";
import { computed, shallowRef, type Ref } from "vue";
import { createScopedTranslator } from "../i18n";
import { formatError } from "../i18n/errors";
import type { ConversationHistoryItem } from "../types/conversation";
import { uiMessage } from "../ui-feedback";
import { invalidateConversationHistoryCursor } from "../utils/conversationHistoryWriter";

const t = createScopedTranslator("components.settingsPage");

export type ArchivedConversationEntry = ConversationHistoryItem & {
  key: string;
  revision: number;
};
export type ArchivedDeleteRequest =
  | { kind: "one"; item: ArchivedConversationEntry }
  | { kind: "selected"; items: ArchivedConversationEntry[] }
  | { kind: "all" };

export function archivedConversationId(
  item: Pick<ArchivedConversationEntry, "key" | "sessionId">
): string {
  return JSON.stringify([item.key, item.sessionId]);
}

export function useArchivedConversationDeletion(options: {
  items: Ref<ArchivedConversationEntry[]>;
  getApi: () => ConversationHistoryApi | undefined;
  reload: () => Promise<void>;
}) {
  const selectedIds = shallowRef<Set<string>>(new Set());
  const pendingDelete = shallowRef<ArchivedDeleteRequest | null>(null);
  const busy = shallowRef(false);
  const deletedCount = shallowRef(0);
  const selectedItems = computed(() =>
    options.items.value.filter((item) =>
      selectedIds.value.has(archivedConversationId(item))
    )
  );
  const allLoadedSelected = computed(
    () =>
      options.items.value.length > 0 &&
      options.items.value.every((item) =>
        selectedIds.value.has(archivedConversationId(item))
      )
  );

  function clearSelection(): void {
    selectedIds.value = new Set();
  }
  function deselect(item: ArchivedConversationEntry): void {
    const next = new Set(selectedIds.value);
    next.delete(archivedConversationId(item));
    selectedIds.value = next;
  }
  function toggleSelection(item: ArchivedConversationEntry): void {
    if (busy.value) return;
    const next = new Set(selectedIds.value);
    const id = archivedConversationId(item);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds.value = next;
  }
  function toggleLoadedSelection(): void {
    if (busy.value) return;
    const next = new Set(selectedIds.value);
    for (const item of options.items.value) {
      const id = archivedConversationId(item);
      if (allLoadedSelected.value) next.delete(id);
      else next.add(id);
    }
    selectedIds.value = next;
  }
  function requestOne(item: ArchivedConversationEntry): void {
    if (!busy.value) pendingDelete.value = { kind: "one", item };
  }
  function requestSelected(): void {
    if (!busy.value && selectedItems.value.length)
      pendingDelete.value = {
        kind: "selected",
        items: [...selectedItems.value]
      };
  }
  function requestAll(): void {
    if (!busy.value && options.items.value.length)
      pendingDelete.value = { kind: "all" };
  }

  async function confirmDelete(): Promise<void> {
    const request = pendingDelete.value;
    const api = options.getApi();
    if (!request || !api || busy.value) return;
    const storage = api;
    busy.value = true;
    deletedCount.value = 0;
    let deleted = 0;
    let failed = 0;
    let firstError: unknown;
    let interrupted = false;
    const removedIds = new Set<string>();
    async function purge(
      item: Pick<ArchivedConversationEntry, "key" | "sessionId" | "revision">
    ) {
      try {
        await storage.purge({
          key: item.key,
          sessionId: item.sessionId,
          expectedRevision: item.revision
        });
        invalidateConversationHistoryCursor(storage, item.key, item.sessionId);
        removedIds.add(archivedConversationId(item));
        deleted += 1;
        deletedCount.value = deleted;
      } catch (error) {
        firstError ??= error;
        failed += 1;
      }
    }
    try {
      if (request.kind === "all") {
        let after: Awaited<
          ReturnType<ConversationHistoryApi["listArchived"]>
        >["next"] = null;
        do {
          const page = await storage.listArchived({
            ...(after ? { after } : {}),
            limit: 100
          });
          for (const { key, session } of page.entries)
            await purge({
              key,
              sessionId: session.sessionId,
              revision: session.revision
            });
          after = page.next;
        } while (after);
      } else {
        const targets = request.kind === "one" ? [request.item] : request.items;
        for (const item of targets) await purge(item);
      }
    } catch {
      interrupted = true;
    } finally {
      options.items.value = options.items.value.filter(
        (entry) => !removedIds.has(archivedConversationId(entry))
      );
      busy.value = false;
      pendingDelete.value = null;
      clearSelection();
      await options.reload();
    }
    if (interrupted)
      uiMessage.error(t("archivedDeletionInterrupted", { count: deleted }));
    else if (failed)
      uiMessage.error(
        request.kind === "one"
          ? formatError(firstError, t("archivedConversationActionFailed"))
          : t("archivedDeletionPartial", { deleted, failed })
      );
    else if (deleted)
      uiMessage.success(t("archivedConversationsDeleted", { count: deleted }));
    else uiMessage.info(t("noArchivedConversations"));
  }

  return {
    selectedIds,
    selectedItems,
    allLoadedSelected,
    pendingDelete,
    busy,
    deletedCount,
    clearSelection,
    deselect,
    toggleSelection,
    toggleLoadedSelection,
    requestOne,
    requestSelected,
    requestAll,
    confirmDelete
  };
}
