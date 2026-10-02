import type {
  SubagentEventEnvelope,
  SubagentPlannedEventEnvelope
} from "./types";
export interface SubagentEventsOperations {
  handleSubagentEvent(event: SubagentEventEnvelope): void;
  handleSubagentPlanned(event: SubagentPlannedEventEnvelope): void;
}
