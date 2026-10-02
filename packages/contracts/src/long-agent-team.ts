import { z } from "zod";
import {
  AgentTeamParallelSubagentsSchema,
  LongAgentSubagentDefinitionsSchema
} from "./agent-team";
import {
  LONG_AGENT_IDS,
  LongAgentIdSchema,
  type LongAgentId
} from "./long-workspace";

export const LongAgentTeamSchema = z
  .object({
    parentAgentId: LongAgentIdSchema,
    subagents: LongAgentSubagentDefinitionsSchema
  })
  .strict();
export type LongAgentTeam = z.infer<typeof LongAgentTeamSchema>;

function validateCompleteLongAgentTeams(
  teams: readonly { parentAgentId: LongAgentId }[],
  context: z.core.$RefinementCtx<unknown>
): void {
  const ids = teams.map((team) => team.parentAgentId);
  for (const id of LONG_AGENT_IDS) {
    if (!ids.includes(id)) {
      context.addIssue({
        code: "custom",
        path: ["teams"],
        message: `Missing long parent agent team: ${id}`
      });
    }
  }
}

export const LongAgentTeamSettingsSchema = z
  .object({
    workspaceType: z.literal("long"),
    parallelSubagents: AgentTeamParallelSubagentsSchema,
    teams: z.array(LongAgentTeamSchema).length(LONG_AGENT_IDS.length)
  })
  .strict()
  .superRefine((value, context) =>
    validateCompleteLongAgentTeams(value.teams, context)
  );
export type LongAgentTeamSettings = z.infer<typeof LongAgentTeamSettingsSchema>;

export const LongAgentTeamSettingsInputSchema = LongAgentTeamSettingsSchema;
export type LongAgentTeamSettingsInput = z.infer<
  typeof LongAgentTeamSettingsInputSchema
>;

export const DEFAULT_LONG_AGENT_TEAM_SETTINGS: LongAgentTeamSettings = {
  workspaceType: "long",
  parallelSubagents: false,
  teams: LONG_AGENT_IDS.map((parentAgentId) => ({
    parentAgentId,
    subagents: []
  }))
};
