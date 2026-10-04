import { describe, expect, it } from "vitest";
// @ts-expect-error Loaded as source text by the Vitest-only virtual module.
import rendererStyles from "virtual:deepwrite-renderer-styles";
import subagentSource from "./SubagentRunDetail.vue?raw";

describe("SubagentRunList parent-delegated task", () => {
  it("shows the full parent-delegated task inside the expanded card", () => {
    expect(subagentSource).toContain("{{ run.task }}");
    expect(subagentSource).toContain("taskAssignedByPrimaryAgent");
    expect(subagentSource).toContain("subagent-run-assigned-task");
    expect(subagentSource).not.toContain("SubagentTaskHoverPreview");
    expect(subagentSource).not.toContain("showTaskPreview");
    expect(subagentSource).not.toContain("subagent-task-preview");
  });

  it("keeps wrapped long assigned tasks readable after expanding the card", () => {
    expect(rendererStyles).toContain(".subagent-run-assigned-task > p");
    expect(rendererStyles).toContain("white-space: pre-wrap;");
    expect(rendererStyles).not.toContain(".subagent-task-preview {");
  });
});
