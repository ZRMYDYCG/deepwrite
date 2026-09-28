import type {
  ExtrasChatTask,
  UserPromptAttachment,
  WorkspaceRuntimeContext
} from "@deepwrite/contracts";
import type { ConversationMessageRewriteRequest } from "../../types/conversation";
import type { WorkspaceDocument } from "../../types/workspace";
import type { WorkspaceContextAttachments } from "./types";
export interface SendMessageOperations {
  sendMessage(
    activeDocument: WorkspaceDocument | null,
    workspaceDocuments?: WorkspaceDocument[],
    attachments?: WorkspaceContextAttachments,
    promptAttachments?: UserPromptAttachment[],
    contextOverride?: WorkspaceRuntimeContext,
    chatTask?: ExtrasChatTask,
    rewriteRequest?: ConversationMessageRewriteRequest
  ): Promise<void>;
}
