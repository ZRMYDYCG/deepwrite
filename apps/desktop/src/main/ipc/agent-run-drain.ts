import type { AgentRunDrainedEventEnvelope } from "@deepwrite/contracts";
import type { UsageRunContext } from "../usage-observation";
import type { ActiveRun } from "./command-types";
import { releaseConversationRun } from "./conversation-operation-guard";

/** Called only for schema-validated events from the Agent Utility. */
export function releaseDrainedAgentRun(
  activeRuns: Map<string, ActiveRun>,
  pendingUsageContexts: Map<string, UsageRunContext>,
  event: AgentRunDrainedEventEnvelope,
  rememberTerminalRun: (runId: string) => void
): void {
  const { sessionId, runId, promptRequestId } = event.payload;
  const run = activeRuns.get(runId);
  if (run && run.sessionId !== sessionId) return;
  if (run?.promptRequestId && run.promptRequestId !== promptRequestId) return;
  rememberTerminalRun(runId);
  activeRuns.delete(runId);
  const released = releaseConversationRun(
    activeRuns,
    sessionId,
    promptRequestId
  );
  if (run || released)
    pendingUsageContexts.delete(
      run?.correlationId ?? event.context.correlationId
    );
}
