import { describe, expect, it } from "vitest";
import {
  AgentEvaluationSnapshotEventEnvelopeSchema,
  AgentMessageCompletedEventEnvelopeSchema,
  AgentMessageDeltaEventEnvelopeSchema,
  AgentUsageObservedEventEnvelopeSchema,
  AgentRetryScheduledEventEnvelopeSchema,
  AgentTurnStartedEventEnvelopeSchema,
  AgentPromptCommandPayloadSchema,
  ActiveResourceSnapshotSchema,
  AppearanceSettingsSchema,
  AppearanceSettingsSnapshotSchema,
  CommandEnvelopeSchema,
  ExpertDraftFileSnapshotSchema,
  ExpertDraftSchema,
  ModelSettingsInputSchema,
  ModelSettingsSchema,
  ExportShortManuscriptResultSchema,
  DEFAULT_LIBRARY_AGENT_SETTINGS,
  LIBRARY_AGENT_ENTRY_MAX_CHARACTERS,
  LibraryAgentSettingsInputSchema,
  PROTOCOL_VERSION,
  PROMPT_IMAGE_ATTACHMENT_MAX_BYTES,
  PromptTextAttachmentSchema,
  SHORT_WORKSPACE_FILE_MAX_CHARACTERS,
  SHORT_WORKSPACE_TEXT_STAGE_IDS,
  ShortCharacterItemSnapshotSchema,
  ShortWorkspaceStageSnapshotSchema,
  SessionPromptAcceptedPayloadSchema,
  SystemEventEnvelopeSchema,
  SystemHealthPayloadSchema,
  SubagentActivitySchema,
  UtilityInboundMessageSchema,
  UtilityOutboundMessageSchema,
  UserPromptAttachmentsSchema,
  WorkspaceRuntimeContextSchema,
  WorkspaceEditorMutationPayloadSchema,
  createDefaultCreativePlotStages,
  createDefaultAppearanceSettings,
  listAppearanceEditorFontFamilyOptions,
  listAppearanceUiFontFamilyOptions,
  resolveAppearanceEditorFontStack,
  resolveAppearanceUiFontStack,
  createShortWorkspaceContentRevision,
  createEnvelope
} from "./index";

const runtime = {
  provider: "deepwrite",
  model: "deepwrite-writing-faux",
  mode: "local-faux" as const
};

function shortWorkspaceRuntimeFixture() {
  const contentRevision = (content: string): string =>
    createShortWorkspaceContentRevision(content);
  const plotStages = createDefaultCreativePlotStages();

  return {
    id: "book_runtime",
    title: "运行时正文",
    categories: ["悬疑"],
    activeStageId: "draft" as const,
    activeAgentId: "expert_draft_coordinator" as const,
    plotStages,
    expertDraft: {
      id: "draft" as const,
      title: "正文",
      revision: contentRevision("draft-directory"),
      sections: [
        {
          id: "section-1",
          title: "第一节",
          wordCountRequirement: "1000 字",
          body: {
            documentId: "draft:section-1:body",
            title: "第一节·正文",
            content: "第一节正文。",
            revision: contentRevision("第一节正文。")
          },
          characterState: {
            documentId: "draft:section-1:state",
            title: "第一节·人物状态",
            content: "人物仍在雨中。",
            revision: contentRevision("人物仍在雨中。")
          }
        },
        {
          id: "section-2",
          title: "第二节",
          wordCountRequirement: "1200 字",
          body: {
            documentId: "draft:section-2:body",
            title: "第二节·正文",
            content: "第二节正文。",
            revision: contentRevision("第二节正文。")
          },
          characterState: {
            documentId: "draft:section-2:state",
            title: "第二节·人物状态",
            content: "人物进入车站。",
            revision: contentRevision("人物进入车站。")
          }
        }
      ]
    },
    stages: SHORT_WORKSPACE_TEXT_STAGE_IDS.map((stageId) => {
      const content = stageId === "outline" ? "第一节：雨夜。" : "";
      return {
        stageId,
        title: stageId,
        content,
        revision: contentRevision(content)
      };
    })
  };
}

export {
  ActiveResourceSnapshotSchema,
  AgentEvaluationSnapshotEventEnvelopeSchema,
  AgentMessageCompletedEventEnvelopeSchema,
  AgentMessageDeltaEventEnvelopeSchema,
  AgentPromptCommandPayloadSchema,
  AgentRetryScheduledEventEnvelopeSchema,
  AgentTurnStartedEventEnvelopeSchema,
  AgentUsageObservedEventEnvelopeSchema,
  AppearanceSettingsSchema,
  AppearanceSettingsSnapshotSchema,
  CommandEnvelopeSchema,
  DEFAULT_LIBRARY_AGENT_SETTINGS,
  ExpertDraftFileSnapshotSchema,
  ExpertDraftSchema,
  LIBRARY_AGENT_ENTRY_MAX_CHARACTERS,
  ExportShortManuscriptResultSchema,
  LibraryAgentSettingsInputSchema,
  ModelSettingsInputSchema,
  ModelSettingsSchema,
  PROMPT_IMAGE_ATTACHMENT_MAX_BYTES,
  PROTOCOL_VERSION,
  PromptTextAttachmentSchema,
  SHORT_WORKSPACE_FILE_MAX_CHARACTERS,
  SHORT_WORKSPACE_TEXT_STAGE_IDS,
  SessionPromptAcceptedPayloadSchema,
  ShortCharacterItemSnapshotSchema,
  ShortWorkspaceStageSnapshotSchema,
  SubagentActivitySchema,
  SystemEventEnvelopeSchema,
  SystemHealthPayloadSchema,
  UserPromptAttachmentsSchema,
  UtilityInboundMessageSchema,
  UtilityOutboundMessageSchema,
  WorkspaceEditorMutationPayloadSchema,
  WorkspaceRuntimeContextSchema,
  createDefaultAppearanceSettings,
  createDefaultCreativePlotStages,
  createEnvelope,
  createShortWorkspaceContentRevision,
  describe,
  expect,
  it,
  listAppearanceEditorFontFamilyOptions,
  listAppearanceUiFontFamilyOptions,
  resolveAppearanceEditorFontStack,
  resolveAppearanceUiFontStack,
  runtime,
  shortWorkspaceRuntimeFixture
};
