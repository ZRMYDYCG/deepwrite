import { formatError } from "../../i18n/errors";
import { createScopedTranslator } from "../../i18n";
import type { AgentConversationController } from "../../composables/useAgentConversation";
import { uiMessage } from "../../ui-feedback";

const t = createScopedTranslator("extras.chatAssistant");

export function useChatAssistantHistoryActions(options: {
  controller: () => Pick<
    AgentConversationController,
    "newConversation" | "selectConversation"
  > &
    Partial<Pick<AgentConversationController, "openConversation">>;
  focusInput: () => void;
  notifications?: Pick<typeof uiMessage, "info" | "error">;
}) {
  const notifications = options.notifications ?? uiMessage;
  function newConversation(): void {
    options.controller().newConversation();
    options.focusInput();
  }
  async function selectConversation(sessionId: string): Promise<void> {
    const conversation = options.controller();
    try {
      const selected = await (conversation.openConversation
        ? conversation.openConversation(sessionId)
        : conversation.selectConversation(sessionId));
      if (!selected) {
        notifications.info(t("waitBeforeHistoryChange"));
        return;
      }
      options.focusInput();
    } catch (error) {
      notifications.error(formatError(error, t("openHistoryFailed")));
    }
  }
  return { newConversation, selectConversation };
}
