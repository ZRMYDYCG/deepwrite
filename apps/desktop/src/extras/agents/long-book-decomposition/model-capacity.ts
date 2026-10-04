import {
  CommandEnvelopeSchema,
  ModelCapacityResultSchema,
  createEnvelope,
  type AgentProviderRuntimeConfig,
  type CommandEnvelope,
  type CommandResult
} from "@deepwrite/contracts";

/** Resolve the same effective model used by Agent, including catalog capacities. */
export async function decompositionModelCapacity(
  requestAgent: (command: CommandEnvelope) => Promise<CommandResult>,
  command: CommandEnvelope,
  model: AgentProviderRuntimeConfig,
  suffix: string
) {
  const result = await requestAgent(
    CommandEnvelopeSchema.parse(
      createEnvelope(
        "agent.model_capacity",
        { runtimeConfig: { ...model, apiKey: "" } },
        { id: `${command.id}-capacity-${suffix}`, context: command.context }
      )
    )
  );
  if (result.status !== "accepted") throw new Error(result.error.message);
  return ModelCapacityResultSchema.parse(result.payload);
}
