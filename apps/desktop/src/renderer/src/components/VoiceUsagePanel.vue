<script setup lang="ts">
import { createScopedTranslator, locale } from "../i18n";
import { computed } from "vue";
import type { VoiceUsageRecord } from "@deepwrite/contracts";
import { VOICE_PROFILE_LABELS } from "../composables/voiceSettingsOptions";
import {
  formatVoiceDuration,
  formatVoiceTokens,
  summarizeVoiceUsage,
  voiceRecordTokens,
  voiceUsagePeriods
} from "../composables/voiceUsageSummary";

const t = createScopedTranslator("components.voiceUsagePanel");

const props = defineProps<{
  records: readonly VoiceUsageRecord[];
  loading: boolean;
}>();
const emit = defineEmits<{ refresh: [] }>();
const periods = computed(() => voiceUsagePeriods(props.records));
const profiles = computed(() =>
  [...new Set(props.records.map((record) => record.profileId))].map((id) => ({
    id,
    label: VOICE_PROFILE_LABELS[id],
    ...summarizeVoiceUsage(
      props.records.filter((record) => record.profileId === id)
    )
  }))
);
const recent = computed(() =>
  [...props.records]
    .sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
    )
    .slice(0, 10)
);
function dateTime(value: string): string {
  return new Date(value).toLocaleString(locale.value, { hour12: false });
}
</script>

<template>
  <section class="voice-usage" aria-labelledby="voice-usage-title">
    <h2 id="voice-usage-title" class="settings-group-title">
      {{ t("voiceUsage") }}
    </h2>
    <div class="settings-card">
      <div class="settings-item">
        <span class="settings-item-text"
          ><strong>{{ t("voiceUsageOnThisDevice") }}</strong
          ><small>{{
            t("onlyTheLatest10RecognitionRecordsAreRetainedIncluding")
          }}</small></span
        >
        <button
          class="voice-button"
          type="button"
          :disabled="loading"
          @click="emit('refresh')"
        >
          {{ loading ? t("refreshing") : t("refreshUsage") }}
        </button>
      </div>
      <div v-for="period in periods" :key="period.label" class="settings-item">
        <span class="settings-item-text"
          ><strong>{{ period.label }}</strong
          ><small
            >{{
              t("recognitionsTokensMessage", {
                arg0: period.count ?? "",
                arg1: formatVoiceTokens(period.totalTokens) ?? ""
              })
            }}<template
              v-if="
                period.reportedCount > 0 && period.reportedCount < period.count
              "
              >{{ t("partialRecords") }}</template
            ></small
          ></span
        >
        <span class="voice-usage-value">{{
          formatVoiceDuration(period.durationMs)
        }}</span>
      </div>
      <div class="settings-item">
        <span class="settings-item-text"
          ><strong>{{ t("aboutTheseStatistics") }}</strong
          ><small>{{
            t("tokensIncludeOnlyValuesReturnedByTheAPINot")
          }}</small></span
        >
      </div>
    </div>
    <div v-if="profiles.length" class="settings-card voice-table-wrap">
      <table class="voice-usage-table">
        <caption>
          {{
            t("summaryByConfiguration")
          }}
        </caption>
        <thead>
          <tr>
            <th>{{ t("accessConfiguration") }}</th>
            <th>{{ t("recognitionsLabel") }}</th>
            <th>{{ t("audioDuration") }}</th>
            <th>Token</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="profile in profiles" :key="profile.id">
            <td>{{ profile.label }}</td>
            <td>{{ profile.count }}</td>
            <td>{{ formatVoiceDuration(profile.durationMs) }}</td>
            <td>
              {{ formatVoiceTokens(profile.totalTokens)
              }}<small
                v-if="
                  profile.reportedCount && profile.reportedCount < profile.count
                "
                >{{ t("partialRecordsLabel") }}</small
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="recent.length" class="settings-card voice-table-wrap">
      <table class="voice-usage-table">
        <caption>
          {{
            t("latestRecognitionsMessage", {
              arg0: recent.length ?? ""
            })
          }}
        </caption>
        <thead>
          <tr>
            <th>{{ t("timeConfiguration") }}</th>
            <th>{{ t("model") }}</th>
            <th>{{ t("duration") }}</th>
            <th>Token</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in recent" :key="record.requestId">
            <td>
              {{ dateTime(record.createdAt)
              }}<small>{{ VOICE_PROFILE_LABELS[record.profileId] }}</small>
            </td>
            <td>{{ record.model }}</td>
            <td>{{ formatVoiceDuration(record.durationMs) }}</td>
            <td>
              {{ formatVoiceTokens(voiceRecordTokens(record))
              }}<small>{{
                t("inputOutputMessage", {
                  arg0: formatVoiceTokens(record.inputTokens) ?? "",
                  arg1: formatVoiceTokens(record.outputTokens) ?? ""
                })
              }}</small>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="settings-card voice-empty">
      {{
        loading
          ? t("readingVoiceUsage")
          : t("noSpeechRecognitionRecordsYetCompleteARecordingTest")
      }}
    </p>
  </section>
</template>

<style scoped src="./settings-page.css"></style>
<style scoped src="./voice-settings.css"></style>
