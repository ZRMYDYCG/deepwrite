import { formatError } from "../../i18n/errors";
import { createScopedTranslator } from "../../i18n";
import type { AgentEditProposal } from "../../types/conversation";
import {
  AcceptedEditDiscardConflictError,
  agentProposalSupportsDiscard,
  approvalUsesModificationTool,
  discardStatePatch
} from "../../utils/acceptedEditDiscard";
import type { AgentConversationController } from "../useAgentConversation";
import type {
  AgentEditReviewRequest,
  ProposalCoordinatorContext
} from "../proposal-coordinator/types";
import {
  discardAcceptedCatalogTextEdit,
  discardAcceptedShortStructureEdit
} from "./short";

const t = createScopedTranslator("workspace.index");

function proposalUsesModificationTool(
  conversation: AgentConversationController,
  proposal: AgentEditProposal
): boolean {
  return conversation.messages.value.some((message) =>
    approvalUsesModificationTool(message, proposal.toolCallIds)
  );
}

function updateDiscardState(
  conversation: AgentConversationController,
  proposal: AgentEditProposal,
  status: NonNullable<AgentEditProposal["discardState"]>["status"],
  message: string
): void {
  const state = discardStatePatch(status, message);
  conversation.updateEditProposal(proposal.runId, proposal.id, {
    discardState: state,
    updatedAt: state.updatedAt
  });
}

function conflictDependentProposals(
  conversation: AgentConversationController,
  proposal: AgentEditProposal
): void {
  for (const candidate of conversation.listEditProposals(proposal.runId)) {
    if (
      candidate.predecessorProposalId !== proposal.id ||
      (candidate.status !== "pending" && candidate.status !== "error")
    ) {
      continue;
    }
    conversation.updateEditProposal(candidate.runId, candidate.id, {
      status: "conflict",
      proposedText: undefined,
      statusMessage: t("thePreviousEditWasDiscardedRegenerateThisEditUsing")
    });
  }
}

export function createAcceptedEditDiscardCoordinator(
  context: ProposalCoordinatorContext
) {
  async function discardProposal(
    conversation: AgentConversationController,
    request: Omit<AgentEditReviewRequest, "decision">
  ): Promise<void> {
    const proposal = conversation.getEditProposal(
      request.runId,
      request.proposalId
    );
    if (
      !proposal ||
      !proposalUsesModificationTool(conversation, proposal) ||
      !agentProposalSupportsDiscard(proposal) ||
      proposal.discardState?.status === "discarding"
    ) {
      return;
    }
    if (context.editor.acceptingWorkspaceIds.value.has(proposal.workspaceId)) {
      context.notifications.info(t("otherEditsToThisProjectAreBeingSavedWait"));
      return;
    }
    updateDiscardState(
      conversation,
      proposal,
      "discarding",
      t("discardingThisEdit")
    );
    context.editor.setWorkspaceAccepting(proposal.workspaceId, true);
    try {
      if (!(await discardAcceptedShortStructureEdit(context, proposal))) {
        await discardAcceptedCatalogTextEdit(context, proposal);
      }
      updateDiscardState(
        conversation,
        proposal,
        "discarded",
        t("editDiscardedThePreviousContentHasBeenRestored")
      );
      conflictDependentProposals(conversation, proposal);
      context.notifications.success(t("editDiscarded"));
    } catch (error: unknown) {
      const conflict =
        error instanceof AcceptedEditDiscardConflictError ||
        context.catalog.isConflict(error);
      const message = formatError(error, t("failedToDiscardThisEdit"));
      updateDiscardState(
        conversation,
        proposal,
        conflict ? "conflict" : "error",
        message
      );
      if (conflict) context.notifications.warning(message);
      else context.notifications.error(message);
    } finally {
      context.editor.setWorkspaceAccepting(proposal.workspaceId, false);
    }
  }

  return {
    discardAgentEdit: (request: Omit<AgentEditReviewRequest, "decision">) =>
      discardProposal(context.conversations.active.value, request)
  };
}
