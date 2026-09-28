import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import {
  ExtrasAgentIdSchema,
  ExtrasAgentOutputSchema,
  type ExtrasAgentId,
  type ExtrasAgentOutput
} from "@deepwrite/contracts";

/** Tool-result details every extras result tool returns. */
export interface ExtrasAgentOutputDetails {
  kind: "extras-agent-output";
  agentId: ExtrasAgentId;
  jobId: string;
  output: ExtrasAgentOutput;
}

export function isExtrasAgentOutputDetails(
  value: unknown
): value is ExtrasAgentOutputDetails {
  if (!value || typeof value !== "object") return false;
  const details = value as Partial<ExtrasAgentOutputDetails>;
  return (
    details.kind === "extras-agent-output" &&
    typeof details.jobId === "string" &&
    ExtrasAgentIdSchema.safeParse(details.agentId).success &&
    ExtrasAgentOutputSchema.safeParse(details.output).success
  );
}

export interface ExtrasOutputTarget {
  agentId: ExtrasAgentId;
  jobId: string;
}

export function extrasOutputResult(
  target: ExtrasOutputTarget,
  message: string,
  output: ExtrasAgentOutput
): AgentToolResult<ExtrasAgentOutputDetails> {
  return {
    content: [{ type: "text", text: message }],
    details: { kind: "extras-agent-output", ...target, output }
  };
}
