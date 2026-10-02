import { createScopedTranslator, locale } from "../i18n";
import { useCatalogIndexStore } from "../stores/catalogIndexStore";
import { useLongWorkspaceStore } from "../stores/longWorkspaceStore";

const t = createScopedTranslator("components.settingsPage");

export function useArchivedConversationPresentation() {
  const catalog = useCatalogIndexStore();
  const longWorkspace = useLongWorkspaceStore();

  function bookName(id: string, isLong: boolean): string {
    return isLong
      ? (longWorkspace.longBooks.find((book) => book.id === id)?.title ?? id)
      : (catalog.snapshot?.books.find((book) => book.id === id)?.title ?? id);
  }

  function sourceLabel(key: string): string {
    const prefix = "conversation-history:";
    const encoded = key.startsWith(prefix) ? key.slice(prefix.length) : key;
    let identity = encoded;
    try {
      identity = decodeURIComponent(encoded);
    } catch {
      /* A long hashed key may end in a partial escaped prefix. */
    }
    if (identity === "general") return t("generalConversationSource");
    if (identity === "chat-assistant:normal") return t("normalChatSource");
    if (identity.startsWith("chat-assistant:roleplay:"))
      return t("roleplayChatSource");
    if (identity.startsWith("chat-assistant:project:")) {
      const project = identity.slice("chat-assistant:project:".length);
      const separator = project.indexOf(":");
      if (separator < 0) return t("otherConversationSource", { id: identity });
      const type = project.slice(0, separator);
      const id = project.slice(separator + 1);
      return t("projectChatSource", {
        name: bookName(id, type === "long")
      });
    }
    if (identity.startsWith("long:") && identity.endsWith(":chat")) {
      const encodedId = identity.slice(5, -5);
      let id = encodedId;
      try {
        id = decodeURIComponent(encodedId);
      } catch {
        /* Preserve the readable encoded prefix. */
      }
      return t("longConversationSource", { id: bookName(id, true) });
    }
    if (identity.endsWith(":chat"))
      return t("bookConversationSource", {
        id: bookName(identity.slice(0, -5), false)
      });
    return t("otherConversationSource", { id: identity });
  }

  function formatTime(value: string): string {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
      ? new Date(timestamp).toLocaleString(locale.value, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      : value;
  }

  return { sourceLabel, formatTime };
}
