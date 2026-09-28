import { vi } from "vitest";
import type {
  DeepWriteApi,
  ExtrasAgentId,
  ExtrasAgentOutput,
  ExtrasAgentRunRequest,
  ExtrasAgentSettings,
  SessionPromptAcceptedPayload,
  SystemEventEnvelope
} from "@deepwrite/contracts/renderer";

type StoredProfile = { id: string; name: string } & Record<string, unknown>;

/**
 * In-memory `extrasAgents` API: records run requests and keeps profiles per
 * agent, restoring the built-ins given at creation on reset.
 */
export function createExtrasAgentsFake(
  builtins: Partial<Record<ExtrasAgentId, StoredProfile[]>> = {}
) {
  const stored = new Map<ExtrasAgentId, StoredProfile[]>(
    Object.entries(builtins).map(([agentId, profiles]) => [
      agentId as ExtrasAgentId,
      structuredClone(profiles)
    ])
  );
  const settings = (agentId: ExtrasAgentId) =>
    ({
      agentId,
      profiles: (stored.get(agentId) ?? []).map((profile) => ({
        ...structuredClone(profile),
        ...(builtins[agentId]?.some((builtin) => builtin.id === profile.id)
          ? { builtin: true }
          : {})
      }))
    }) as ExtrasAgentSettings;
  const run = vi.fn<
    (request: ExtrasAgentRunRequest) => Promise<SessionPromptAcceptedPayload>
  >(async (request) => ({
    sessionId: request.sessionId,
    runId: `${request.sessionId}-run`,
    acceptedAt: new Date().toISOString(),
    runtime: { provider: "test", model: "test", mode: "provider" }
  }));
  const save = vi.fn(
    async (input: { agentId: ExtrasAgentId; profiles: StoredProfile[] }) => {
      stored.set(input.agentId, structuredClone(input.profiles));
      return settings(input.agentId);
    }
  );
  const extrasAgents = {
    run,
    profiles: {
      list: vi.fn(async (agentId: ExtrasAgentId) => settings(agentId)),
      save,
      reset: vi.fn(async (agentId: ExtrasAgentId) => {
        stored.set(agentId, structuredClone(builtins[agentId] ?? []));
        return settings(agentId);
      })
    }
  } as unknown as DeepWriteApi["extrasAgents"];
  return { extrasAgents, run, save };
}

export function runEvent(
  type: string,
  request: Pick<ExtrasAgentRunRequest, "sessionId">,
  payload: Record<string, unknown> = {}
): SystemEventEnvelope {
  return {
    type,
    payload: {
      sessionId: request.sessionId,
      runId: `${request.sessionId}-run`,
      ...payload
    }
  } as SystemEventEnvelope;
}

export function outputEvent(
  request: ExtrasAgentRunRequest,
  output: ExtrasAgentOutput
): SystemEventEnvelope {
  return runEvent("extras_agent.output_updated", request, {
    agentId: request.task.agentId,
    jobId: "jobId" in request.task.input ? request.task.input.jobId : "",
    output
  });
}
