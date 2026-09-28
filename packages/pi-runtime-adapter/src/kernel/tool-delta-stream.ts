import { reconcileToolCallArguments } from "../event-mapping";
import type { AgentRuntimeEvent } from "../runtime-types";

type ToolStreamEvent = Extract<
  AgentRuntimeEvent,
  { type: "agent.tool_stream" }
>;

const TOOL_STREAM_DELTA_FLUSH_MS = 100;

/** Normalizes streamed tool arguments and coalesces deltas before emission. */
export class ToolDeltaStream {
  private readonly pending = new Map<string, ToolStreamEvent>();
  private readonly streamedArguments = new Map<string, string>();
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly emit: (event: AgentRuntimeEvent) => void) {}

  push(event: ToolStreamEvent): void {
    const currentArguments =
      this.streamedArguments.get(event.payload.streamId) ?? "";
    const normalized = reconcileToolCallArguments(
      currentArguments,
      event.payload.argumentsDelta,
      event.payload.argumentsSnapshot
    );
    event.payload.argumentsDelta = normalized.delta;
    delete event.payload.argumentsSnapshot;
    this.streamedArguments.set(event.payload.streamId, normalized.next);
    if (event.payload.phase !== "delta") {
      this.flush();
      this.emit(event);
      return;
    }
    const existing = this.pending.get(event.payload.streamId);
    if (existing) {
      existing.payload.argumentsDelta += event.payload.argumentsDelta;
      if (event.payload.toolCallId)
        existing.payload.toolCallId = event.payload.toolCallId;
      if (event.payload.toolName)
        existing.payload.toolName = event.payload.toolName;
    } else {
      this.pending.set(event.payload.streamId, event);
    }
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), TOOL_STREAM_DELTA_FLUSH_MS);
      this.timer.unref();
    }
  }

  flush(): void {
    this.clearTimer();
    for (const event of this.pending.values()) this.emit(event);
    this.pending.clear();
  }

  /** Drops unflushed deltas and argument state, e.g. before a turn retry. */
  reset(): void {
    this.clearTimer();
    this.pending.clear();
    this.streamedArguments.clear();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
