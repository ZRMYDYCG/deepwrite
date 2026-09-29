import { ref } from "vue";
import { createShortWorkspaceContentRevision } from "@deepwrite/contracts";
import { describe, expect, it, vi } from "vitest";
import type { AgentEditProposal } from "../../types/conversation";
import type { AgentConversationController } from "../useAgentConversation";
import type { ProposalCoordinatorContext } from "../proposal-coordinator/types";
import { createAcceptedEditDiscardCoordinator } from "./index";

describe("accepted edit undo coordinator", () => {
  it("restores a saved short-story edit without a matching tool trace", async () => {
    let proposal: AgentEditProposal = {
      id: "proposal-1",
      runId: "run-1",
      workspaceId: "book-1",
      stageId: "plot_design",
      documentId: "plot-design-1",
      title: "剧情设计",
      summary: "修改剧情设计",
      status: "accepted",
      baseRevision: createShortWorkspaceContentRevision("修改前"),
      proposedRevision: createShortWorkspaceContentRevision("修改后"),
      toolCallIds: ["missing-tool-trace"],
      additions: 1,
      deletions: 1,
      hunks: [],
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:01.000Z",
      discardSnapshot: { beforeText: "修改前", beforeTitle: "剧情设计" }
    };
    const conversation = {
      messages: ref([{ editProposals: [proposal] }]),
      getEditProposal: vi.fn(() => proposal),
      listEditProposals: vi.fn(() => [proposal]),
      updateEditProposal: vi.fn(
        (
          _runId: string,
          _proposalId: string,
          patch: Partial<AgentEditProposal>
        ) => {
          proposal = { ...proposal, ...patch };
        }
      )
    } as unknown as AgentConversationController;
    const applyAcceptedDocumentLocally = vi.fn();
    const context = {
      api: () => undefined,
      conversations: { active: ref(conversation) },
      editor: {
        acceptingWorkspaceIds: ref(new Set<string>()),
        setWorkspaceAccepting: vi.fn(),
        documents: ref([
          { id: "plot-design-1", title: "剧情设计", content: "修改后" }
        ]),
        drafts: ref({})
      },
      catalog: {
        isConflict: () => false,
        applyAcceptedDocumentLocally
      },
      notifications: {
        info: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn()
      }
    } as unknown as ProposalCoordinatorContext;

    await createAcceptedEditDiscardCoordinator(context).discardAgentEdit({
      runId: proposal.runId,
      proposalId: proposal.id
    });

    expect(applyAcceptedDocumentLocally).toHaveBeenCalledWith(
      { id: "plot-design-1", title: "剧情设计", content: "修改前" },
      undefined,
      undefined
    );
    expect(proposal.discardState?.status).toBe("discarded");
  });
});
