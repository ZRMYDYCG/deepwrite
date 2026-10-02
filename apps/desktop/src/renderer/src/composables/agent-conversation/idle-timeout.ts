import { t } from "../../i18n";
import type { AgentRuntimeRef } from "@deepwrite/contracts";
import { discardPendingAssistantMessage } from "./message-identity";
import type { AgentConversationState } from "./context";
import { isActiveSubagentRun } from "../../types/conversation";

export interface IdleTimeoutScope {
  expectedEpoch: number;
  expectedSessionId: string;
  attemptId?: number;
  runId?: string;
}

type IdleState = Pick<
  AgentConversationState,
  | "epoch"
  | "sessionId"
  | "activeRunId"
  | "pendingAttemptId"
  | "messages"
  | "runtime"
  | "observedRunByAttempt"
  | "approvalModeByAttempt"
  | "submitting"
  | "stopping"
  | "conversationError"
>;

/** The utility owns the child deadline; UI silence is expected during delegation. */
export function expireIdleConversation(
  state: IdleState,
  scope: IdleTimeoutScope,
  failRun: (runId: string, message: string, runtime?: AgentRuntimeRef) => void
): void {
  if (
    state.epoch !== scope.expectedEpoch ||
    state.sessionId.value !== scope.expectedSessionId
  )
    return;
  const ownsRun =
    scope.runId !== undefined && state.activeRunId.value === scope.runId;
  const ownsAttempt =
    scope.attemptId !== undefined &&
    state.pendingAttemptId.value === scope.attemptId;
  if (!ownsRun && !ownsAttempt) return;
  const runId = ownsRun ? scope.runId : state.activeRunId.value;
  if (
    runId &&
    state.messages.value.some(
      (message) =>
        message.runId === runId &&
        message.subagentRuns?.some(isActiveSubagentRun)
    )
  )
    return;

  const message = t(
    "workspace.idleTimeout.theAgentHasNotReturnedNewEventsForAn"
  );
  if (scope.runId) {
    failRun(scope.runId, message, state.runtime.value ?? undefined);
    if (state.activeRunId.value === scope.runId) state.activeRunId.value = null;
  }
  if (ownsAttempt && scope.attemptId !== undefined) {
    state.pendingAttemptId.value = null;
    state.observedRunByAttempt.delete(scope.attemptId);
    state.approvalModeByAttempt.delete(scope.attemptId);
  }
  if (!scope.runId) {
    discardPendingAssistantMessage(state);
  }
  state.submitting.value = false;
  state.stopping.value = false;
  state.conversationError.value = message;
}
