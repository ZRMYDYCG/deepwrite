import { formatError } from "../../i18n/errors";
import { createScopedTranslator } from "../../i18n";
import type { AgentEditProposal } from "../../types/conversation";
import {
  beginAgentEditProposalCommit,
  createAgentEditProposalRevisionLane,
  stageAgentEditProposalRevision
} from "../../utils/agentEditProposalRevisionLane";
import { createKeyedSerialTaskQueue } from "../../utils/keyedSerialTaskQueue";
import type { AgentConversationController } from "../useAgentConversation";
import type { QueuedAgentEdit } from "./types";

const t = createScopedTranslator("workspace.queue");

interface ProposalQueueOptions {
  apply(queued: QueuedAgentEdit): Promise<void>;
  priority(
    conversation: AgentConversationController,
    runId: string,
    proposalId: string
  ): number;
  reportUnexpectedError(error: unknown): void;
}

function queueKey(sessionId: string, runId: string, proposalId: string) {
  return `${sessionId}\u0000${runId}\u0000${proposalId}`;
}

function unexpectedQueueErrorMessage(error: unknown): string {
  const detail = formatError(error, t("unknownError"));
  return t("theApprovalSaveQueueFailedThisItemIsPaused", {
    detail: detail
  });
}

function proposalQueueToken(proposal: AgentEditProposal): string {
  return proposal.proposedRevision ?? proposal.id;
}

function proposalQueueBaseToken(proposal: AgentEditProposal): string {
  return (
    proposal.baseRevision ??
    proposal.predecessorProposalId ??
    proposal.laneId ??
    proposal.id
  );
}

export function createProposalQueue(options: ProposalQueueOptions) {
  const queuedAgentEdits = new Map<string, QueuedAgentEdit>();
  const deferredAgentEditKeys = new Set<string>();
  const agentEditCommitQueue = createKeyedSerialTaskQueue<string>();
  const activeInvocations = new Set<Promise<void>>();
  const activeAgentEditCommitTasks = new Set<Promise<void>>();
  let disposed = false;
  let disposePromise: Promise<void> | undefined;
  let decisionSequence = 0;

  function deleteQueuedEdit(key: string): void {
    queuedAgentEdits.delete(key);
    deferredAgentEditKeys.delete(key);
  }

  function removeQueuedAgentEdit(
    conversation: AgentConversationController,
    runId: string,
    proposalId: string
  ): void {
    for (const [key, queued] of queuedAgentEdits) {
      if (
        queued.conversation === conversation &&
        queued.runId === runId &&
        queued.proposalId === proposalId
      ) {
        deleteQueuedEdit(key);
      }
    }
  }

  function scheduleQueuedAgentEdits(
    matches: (queued: QueuedAgentEdit) => boolean
  ): void {
    if (disposed) return;
    const matchingEntries = [...queuedAgentEdits.entries()].filter(
      ([, queued]) => matches(queued)
    );
    const workspaceIds = new Set<string>();
    for (const [key, queued] of matchingEntries) {
      deferredAgentEditKeys.delete(key);
      workspaceIds.add(queued.workspaceId);
    }
    for (const workspaceId of workspaceIds) {
      const task = agentEditCommitQueue
        .enqueue(workspaceId, () => drainWorkspace(workspaceId))
        .catch((error: unknown) => {
          options.reportUnexpectedError(error);
        });
      activeAgentEditCommitTasks.add(task);
      void task.then(
        () => {
          activeAgentEditCommitTasks.delete(task);
        },
        () => {
          activeAgentEditCommitTasks.delete(task);
        }
      );
    }
  }

  function queueAgentEdit(
    conversation: AgentConversationController,
    sessionId: string,
    runId: string,
    proposalId: string,
    automatic: boolean,
    scheduleImmediately: boolean
  ): void {
    if (disposed) return;
    const proposal = conversation.getEditProposal(runId, proposalId);
    if (
      !proposal ||
      (proposal.status !== "pending" && proposal.status !== "error")
    ) {
      return;
    }

    const key = queueKey(sessionId, runId, proposalId);
    const existing = queuedAgentEdits.get(key);
    const proposedToken = proposalQueueToken(proposal);
    if (existing?.expectedProposedRevision === proposedToken) {
      if (scheduleImmediately) {
        scheduleQueuedAgentEdits((queued) => queued === existing);
      }
      return;
    }

    decisionSequence += 1;
    const decisionToken = `${proposal.runId}:${proposal.id}:${proposal.generation ?? 1}:${decisionSequence}`;
    const staged = stageAgentEditProposalRevision(
      createAgentEditProposalRevisionLane<AgentEditProposal>({
        targetKey: proposal.laneId ?? proposal.id,
        durableRevision: proposalQueueBaseToken(proposal),
        overlayRevision:
          proposal.sourceBaseRevision ?? proposalQueueBaseToken(proposal),
        generation: Math.max(0, (proposal.generation ?? 1) - 1)
      }),
      {
        approvalMode:
          proposal.approvalMode ??
          (automatic ? "auto-approve" : "request-approval"),
        sourceBaseRevision:
          proposal.sourceBaseRevision ?? proposalQueueBaseToken(proposal),
        proposedRevision: proposedToken,
        proposal
      }
    );
    if (staged.status !== "staged") return;
    const started = beginAgentEditProposalCommit(staged.lane, {
      generation: proposal.generation ?? 1,
      token: decisionToken
    });
    if (started.status !== "started") return;

    if (scheduleImmediately && !automatic) {
      conversation.updateEditProposal(runId, proposalId, {
        status: "accepting",
        decisionToken,
        statusMessage: t("approvedWaitingForThisProjectSSaveQueue")
      });
    }
    const queued: QueuedAgentEdit = {
      conversation,
      sessionId,
      runId,
      proposalId,
      workspaceId: proposal.workspaceId,
      automatic,
      expectedProposedRevision: proposedToken,
      decisionToken,
      snapshot: started.snapshot
    };
    queuedAgentEdits.set(key, queued);
    deferredAgentEditKeys.delete(key);
    if (scheduleImmediately) {
      scheduleQueuedAgentEdits((candidate) => candidate === queued);
    }
  }

  function isValidReservation(
    queued: QueuedAgentEdit,
    current: AgentEditProposal | undefined
  ): current is AgentEditProposal {
    return Boolean(
      current &&
      queued.snapshot.token === queued.decisionToken &&
      queued.snapshot.proposal.id === queued.proposalId &&
      queued.snapshot.proposedRevision === queued.expectedProposedRevision &&
      proposalQueueToken(current) === queued.expectedProposedRevision &&
      (current.status === "pending" ||
        current.status === "error" ||
        (current.status === "accepting" &&
          current.decisionToken === queued.decisionToken))
    );
  }

  function deferUnfinishedEdit(
    key: string,
    queued: QueuedAgentEdit,
    current: AgentEditProposal
  ): boolean {
    if (proposalQueueToken(current) !== queued.expectedProposedRevision) {
      return false;
    }
    if (current.status === "accepting") {
      queued.conversation.updateEditProposal(queued.runId, queued.proposalId, {
        status: "pending",
        statusMessage: t("thisApprovalIsWaitingForARelatedTaskThe")
      });
    } else if (current.status !== "pending") {
      return false;
    }
    deferredAgentEditKeys.add(key);
    return true;
  }

  async function drainWorkspace(workspaceId: string): Promise<void> {
    const entries = [...queuedAgentEdits.entries()]
      .filter(
        ([key, queued]) =>
          queued.workspaceId === workspaceId && !deferredAgentEditKeys.has(key)
      )
      .sort(([, left], [, right]) => {
        const priority =
          options.priority(left.conversation, left.runId, left.proposalId) -
          options.priority(right.conversation, right.runId, right.proposalId);
        if (priority !== 0) return priority;
        const leftProposal = left.conversation.getEditProposal(
          left.runId,
          left.proposalId
        );
        const rightProposal = right.conversation.getEditProposal(
          right.runId,
          right.proposalId
        );
        return (
          (leftProposal?.generation ?? 1) - (rightProposal?.generation ?? 1) ||
          Date.parse(leftProposal?.createdAt ?? "") -
            Date.parse(rightProposal?.createdAt ?? "")
        );
      });
    let terminalStateChanged = false;

    for (const [key, queued] of entries) {
      if (queuedAgentEdits.get(key) !== queued) continue;
      const current = queued.conversation.getEditProposal(
        queued.runId,
        queued.proposalId
      );
      if (!isValidReservation(queued, current)) {
        deleteQueuedEdit(key);
        continue;
      }
      if (current.status === "pending" || current.status === "error") {
        queued.conversation.updateEditProposal(
          queued.runId,
          queued.proposalId,
          {
            status: "accepting",
            decisionToken: queued.decisionToken,
            statusMessage: queued.automatic
              ? t("addedToTheAutomaticSaveQueue")
              : t("approvedWaitingForThisProjectSSaveQueue")
          }
        );
      }
      if (queuedAgentEdits.get(key) !== queued) continue;

      try {
        await options.apply(queued);
      } catch (error: unknown) {
        const failed = queued.conversation.getEditProposal(
          queued.runId,
          queued.proposalId
        );
        if (
          failed &&
          proposalQueueToken(failed) === queued.expectedProposedRevision &&
          (failed.status === "accepting" || failed.status === "pending")
        ) {
          queued.conversation.updateEditProposal(
            queued.runId,
            queued.proposalId,
            {
              status: "error",
              statusMessage: unexpectedQueueErrorMessage(error)
            }
          );
        }
        options.reportUnexpectedError(error);
      }

      if (queuedAgentEdits.get(key) !== queued) continue;
      const after = queued.conversation.getEditProposal(
        queued.runId,
        queued.proposalId
      );
      if (after && deferUnfinishedEdit(key, queued, after)) continue;
      deleteQueuedEdit(key);
      terminalStateChanged = true;
    }

    if (
      terminalStateChanged &&
      [...queuedAgentEdits.entries()].some(
        ([key, queued]) =>
          queued.workspaceId === workspaceId && deferredAgentEditKeys.has(key)
      )
    ) {
      scheduleQueuedAgentEdits((queued) => queued.workspaceId === workspaceId);
    }
  }

  function hasQueuedAgentEdits(): boolean {
    const hasRunnableEdit = [...queuedAgentEdits.keys()].some(
      (key) => !deferredAgentEditKeys.has(key)
    );
    return hasRunnableEdit || activeAgentEditCommitTasks.size > 0;
  }

  function invokeWhileActive(operation: () => Promise<void>): Promise<void> {
    if (disposed) return Promise.resolve();
    const invocation = operation();
    activeInvocations.add(invocation);
    void invocation.then(
      () => {
        activeInvocations.delete(invocation);
      },
      () => {
        activeInvocations.delete(invocation);
      }
    );
    return invocation;
  }

  async function drain(): Promise<void> {
    while (activeInvocations.size > 0 || activeAgentEditCommitTasks.size > 0) {
      await Promise.allSettled([
        ...activeInvocations,
        ...activeAgentEditCommitTasks
      ]);
    }
  }

  function dispose(): Promise<void> {
    if (disposePromise) return disposePromise;
    disposed = true;
    disposePromise = drain().finally(() => {
      queuedAgentEdits.clear();
      deferredAgentEditKeys.clear();
    });
    return disposePromise;
  }

  return {
    removeQueuedAgentEdit,
    queueAgentEdit,
    scheduleQueuedAgentEdits,
    hasQueuedAgentEdits,
    invokeWhileActive,
    drain,
    dispose,
    isDisposed: () => disposed
  };
}
