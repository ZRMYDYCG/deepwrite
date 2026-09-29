import { describe, expect, it } from "vitest";
import type { VoiceUsageRecord } from "@deepwrite/contracts";
import {
  formatVoiceTokens,
  summarizeVoiceUsage,
  voiceRecordTokens,
  voiceUsagePeriods
} from "./voiceUsageSummary";

function record(overrides: Partial<VoiceUsageRecord> = {}): VoiceUsageRecord {
  return {
    requestId: "voice-test-record",
    profileId: "mimo-api",
    model: "test-asr",
    createdAt: new Date(2026, 8, 28, 10).toISOString(),
    durationMs: 12_000,
    ...overrides
  };
}

describe("voice usage summaries", () => {
  it("preserves the difference between missing token usage and a reported zero", () => {
    expect(summarizeVoiceUsage([record()])).toEqual({
      count: 1,
      durationMs: 12_000,
      totalTokens: undefined,
      reportedCount: 0
    });
    expect(formatVoiceTokens(undefined)).toBe("未返回");
    expect(formatVoiceTokens(0)).toBe("0");
    expect(summarizeVoiceUsage([record({ totalTokens: 0 })]).totalTokens).toBe(
      0
    );
  });

  it("marks incomplete coverage while totaling only reported usage", () => {
    const summary = summarizeVoiceUsage([
      record({ inputTokens: 14, outputTokens: 3 }),
      record({ totalTokens: 10 }),
      record(),
      record({ inputTokens: 7 })
    ]);
    expect(summary).toMatchObject({
      count: 4,
      totalTokens: 27,
      reportedCount: 2
    });
    expect(voiceRecordTokens(record({ inputTokens: 7 }))).toBeUndefined();
    expect(
      voiceRecordTokens(
        record({ inputTokens: 7, outputTokens: 2, totalTokens: 12 })
      )
    ).toBe(12);
  });

  it("uses local calendar boundaries for today and month while retaining lifetime usage", () => {
    const now = new Date(2026, 8, 28, 12);
    const records = [
      record(),
      record({ createdAt: new Date(2026, 8, 27, 23, 59).toISOString() }),
      record({ createdAt: new Date(2026, 7, 31, 23, 59).toISOString() })
    ];
    expect(voiceUsagePeriods(records, now).map(({ count }) => count)).toEqual([
      1, 2, 3
    ]);
    expect(
      voiceUsagePeriods([], now).every(
        ({ totalTokens }) => totalTokens === undefined
      )
    ).toBe(true);
  });
});
