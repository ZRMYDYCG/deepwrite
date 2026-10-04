import type { ActiveRun } from "./command-types";

type SessionOperation = {
  prompt?: { ownerId?: string; release(): void };
  management: boolean;
};
const states = new WeakMap<
  Map<string, ActiveRun>,
  Map<string, SessionOperation>
>();

function scope(runs: Map<string, ActiveRun>) {
  let sessions = states.get(runs);
  if (!sessions) {
    sessions = new Map();
    states.set(runs, sessions);
  }
  return sessions;
}

/** Main owns a prompt until the Agent confirms that its execution drained. */
export function acquireConversationOperation(
  runs: Map<string, ActiveRun>,
  sessionId: string,
  operation: "prompt" | "management",
  ownerId?: string
): (() => void) | undefined {
  const sessions = scope(runs);
  const current = sessions.get(sessionId) ?? { management: false };
  if (
    current.management ||
    current.prompt ||
    [...runs.values()].some((run) => run.sessionId === sessionId)
  )
    return undefined;
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    if (operation === "prompt") delete current.prompt;
    else current.management = false;
    if (!current.prompt && !current.management) sessions.delete(sessionId);
  };
  if (operation === "prompt")
    current.prompt = { ...(ownerId ? { ownerId } : {}), release };
  else current.management = true;
  sessions.set(sessionId, current);
  return release;
}

/** A late drain from an older prompt must never unlock the current prompt. */
export function releaseConversationRun(
  runs: Map<string, ActiveRun>,
  sessionId: string,
  ownerId: string
): boolean {
  const prompt = scope(runs).get(sessionId)?.prompt;
  if (prompt?.ownerId !== ownerId) return false;
  prompt.release();
  return true;
}

/** Worker death is the only fallback when acceptance or drainage is unknown. */
export function releaseConversationRuns(runs: Map<string, ActiveRun>): void {
  for (const operation of scope(runs).values()) operation.prompt?.release();
}
