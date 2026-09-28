import {
  fauxAssistantMessage,
  fauxText,
  fauxThinking
} from "@earendil-works/pi-ai";
import { CHAT_ASSISTANT_ROLEPLAY_PROMPT_SUFFIX } from "@deepwrite/contracts";
import type { ExtrasConversationAgentDefinition } from "../definition";

const FAUX_REPLY =
  "人物扮演聊天链路已就绪，未装配工具。请选择真实模型开始人物扮演。";

/**
 * Roleplay chat. The profile prompt is the role definition; the agent gets
 * no tools and no app context beyond the conversation itself.
 */
export const chatRoleplayAgent: ExtrasConversationAgentDefinition<"chat-roleplay"> =
  {
    id: "chat-roleplay",
    interaction: "conversation",
    boundaryTitle: "人物扮演",
    boundary: () => [CHAT_ASSISTANT_ROLEPLAY_PROMPT_SUFFIX],
    tools: () => [],
    conversationKey: ({ profile }) => profile.id,
    faux: (_task, turn) => [
      fauxAssistantMessage(
        turn.thinking
          ? [fauxThinking("正在根据人物定义组织回复。"), fauxText(FAUX_REPLY)]
          : [fauxText(FAUX_REPLY)]
      )
    ]
  };
