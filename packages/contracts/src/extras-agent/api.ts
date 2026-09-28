import type { SessionPromptAcceptedPayload } from "../session/commands";
import type { ExtrasAgentId } from "./ids";
import type {
  ExtrasAgentSettingsInputOf,
  ExtrasAgentSettingsOf
} from "./profiles";
import type { ExtrasAgentRunRequest } from "./tasks";

/** Preload API for "更多功能" agents; runs are stopped with `session.abort`. */
export interface ExtrasAgentApi {
  run(request: ExtrasAgentRunRequest): Promise<SessionPromptAcceptedPayload>;
  profiles: {
    list<A extends ExtrasAgentId>(
      agentId: A
    ): Promise<ExtrasAgentSettingsOf<A>>;
    save<A extends ExtrasAgentId>(
      input: ExtrasAgentSettingsInputOf<A>
    ): Promise<ExtrasAgentSettingsOf<A>>;
    reset<A extends ExtrasAgentId>(
      agentId: A,
      profileId?: string
    ): Promise<ExtrasAgentSettingsOf<A>>;
  };
}
