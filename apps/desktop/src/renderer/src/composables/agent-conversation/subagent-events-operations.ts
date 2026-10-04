import type {
  SubagentDrawUpdatedEventEnvelope,
  SubagentEventEnvelope,
  SubagentPlannedEventEnvelope
} from "./types";
export interface SubagentEventsOperations {
  handleSubagentEvent(event: SubagentEventEnvelope): void;
  handleSubagentPlanned(event: SubagentPlannedEventEnvelope): void;
  handleSubagentDrawUpdated(event: SubagentDrawUpdatedEventEnvelope): void;
}
