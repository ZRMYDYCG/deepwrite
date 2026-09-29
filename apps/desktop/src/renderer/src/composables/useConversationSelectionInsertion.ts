import { t } from "../i18n";
import { watch } from "vue";
import { randomHex8 } from "@deepwrite/shared";
import type { ChatMessage, EditorTextReference } from "../types/conversation";
import { createConversationTextReference } from "../utils/editorTextReferences";
import { useSelectionInsertionMenu } from "./useSelectionInsertionMenu";

export function useConversationSelectionInsertion(options: {
  messages(): ChatMessage[];
  conversationSessionId(): string | undefined;
  insert(reference: EditorTextReference): void;
}) {
  const { closeSelectionAction, openSelectionAction } =
    useSelectionInsertionMenu(options);
  watch(
    () => [options.conversationSessionId(), options.messages()],
    closeSelectionAction
  );
  function handleConversationContextMenu(event: MouseEvent): void {
    const target = event.target;
    const list = event.currentTarget;
    if (!(target instanceof Element) || !(list instanceof HTMLElement)) return;
    const response = target.closest<HTMLElement>(
      "[data-assistant-response-message-id]"
    );
    const selection = globalThis.getSelection?.();
    if (
      !response ||
      !list.contains(response) ||
      !selection ||
      selection.isCollapsed ||
      selection.rangeCount !== 1 ||
      !response.contains(selection.getRangeAt(0).commonAncestorContainer)
    ) {
      closeSelectionAction();
      return;
    }

    const messageId = response.dataset.assistantResponseMessageId;
    const sessionId = options.conversationSessionId();
    if (!messageId || !sessionId) return;
    const responseNumber =
      options
        .messages()
        .filter(({ role }) => role === "assistant")
        .findIndex(({ id }) => id === messageId) + 1;
    if (responseNumber < 1) return;
    const reference = createConversationTextReference({
      id: randomHex8(),
      sessionId,
      messageId,
      messageLabel: t(
        "workspace.conversationSelectionInsertion.agentResponse",
        { responseNumber: responseNumber }
      ),
      text: selection.toString()
    });
    if (!reference) return;
    openSelectionAction(
      reference,
      event,
      undefined,
      () =>
        options.conversationSessionId() === sessionId &&
        response.isConnected &&
        response.dataset.assistantResponseMessageId === messageId &&
        options
          .messages()
          .some(
            (message) =>
              message.id === messageId &&
              message.role === "assistant" &&
              message.status !== "streaming"
          )
    );
  }
  return { handleConversationContextMenu };
}
