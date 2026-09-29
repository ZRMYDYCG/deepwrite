import { describe, expect, it } from "vitest";
import { expectSourceToContain } from "../../../test-utils/sourceText";
import panelSource from "./ModelUsagePanel.vue?raw";
import presentationSource from "../composables/useModelUsagePanel.ts?raw";

const source = `${panelSource}\n${presentationSource}`;

describe("ModelUsagePanel", () => {
  it("provides a local usage dashboard with time-range queries", () => {
    expect(source).toContain("dashboard: ModelUsageDashboard | null");
    expect(source).toContain("query: [input: ModelUsageQueryInput]");
    expect(source).toContain("lastHours");
    expect(source).toContain('const selectedRange = ref<TimeRange>("24h")');
    expect(source).toContain("lastDays");
    expect(source).toContain("lastDays2");
    expect(source).toContain("allTime");
    expect(source).toContain('emit("query", createQuery(range))');
    expect(source).toContain('emit("query", createQuery(selectedRange.value))');
    expect(source).toContain("trendGranularity");
  });

  it("keeps current and historical model usage visible with safe states", () => {
    expect(source).toContain("currentConfiguration");
    expect(source).toContain("historicalModel");
    expect(source).toContain("noModelUsageYet");
    expect(source).toContain('v-else-if="isEmpty && !hasModels"');
    expect(source).toContain("unused");
    expect(source).toContain("readingLocalUsage");
    expect(source).toContain("usageByModule");
    expect(source).toContain("modelStatus");
    expect(source).toContain("recentCalls");
    expectSourceToContain(source, "showingEntriesUpToRetainedLocallyMessage");
    expect(source).toContain("localSimulation");
  });
});
