import { createScopedTranslator, locale } from "../i18n";
import type { VoiceUsageRecord } from "@deepwrite/contracts";

const t = createScopedTranslator("workspace.voiceUsageSummary");

export function voiceRecordTokens(
  record: VoiceUsageRecord
): number | undefined {
  if (record.totalTokens !== undefined) return record.totalTokens;
  if (record.inputTokens !== undefined && record.outputTokens !== undefined) {
    return record.inputTokens + record.outputTokens;
  }
  return undefined;
}

export function summarizeVoiceUsage(records: readonly VoiceUsageRecord[]) {
  const known = records.flatMap((record) => {
    const value = voiceRecordTokens(record);
    return value === undefined ? [] : [value];
  });
  return {
    count: records.length,
    durationMs: records.reduce((total, record) => total + record.durationMs, 0),
    totalTokens: known.length
      ? known.reduce((total, value) => total + value, 0)
      : undefined,
    reportedCount: known.length
  };
}

export function voiceUsagePeriods(
  records: readonly VoiceUsageRecord[],
  now = new Date()
) {
  const dayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const throughNow = (start: number) =>
    records.filter((record) => {
      const time = Date.parse(record.createdAt);
      return time >= start && time <= now.getTime();
    });
  return [
    {
      label: t("today"),
      ...summarizeVoiceUsage(throughNow(dayStart))
    },
    {
      label: t("thisMonth"),
      ...summarizeVoiceUsage(throughNow(monthStart))
    },
    {
      label: t("allTime"),
      ...summarizeVoiceUsage(records)
    }
  ];
}

export function formatVoiceDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  if (seconds < 60) return t("s", { seconds: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return t("mS", {
      minutes: minutes,
      value: seconds % 60
    });
  return t("hM", {
    floor: Math.floor(minutes / 60),
    value: minutes % 60
  });
}

export function formatVoiceTokens(value: number | undefined): string {
  return value === undefined
    ? t("notReported")
    : new Intl.NumberFormat(locale.value).format(value);
}
