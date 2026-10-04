<script setup lang="ts">
import type {
  ImageUsageRecord,
  ImageModelProfile
} from "@deepwrite/contracts/renderer";
import { createScopedTranslator } from "../i18n";
const t = createScopedTranslator("components.imageModelSettings");
defineProps<{
  records: readonly ImageUsageRecord[];
  profiles: readonly ImageModelProfile[];
}>();
defineEmits<{ refresh: [] }>();
</script>
<template>
  <h2 class="settings-group-title">{{ t("usage") }}</h2>
  <div class="settings-card image-usage">
    <button class="voice-button" type="button" @click="$emit('refresh')">
      {{ t("refresh") }}
    </button>
    <p v-if="!records.length">{{ t("emptyUsage") }}</p>
    <table v-else>
      <thead>
        <tr>
          <th>{{ t("time") }}</th>
          <th>{{ t("profile") }}</th>
          <th>{{ t("model") }}</th>
          <th>{{ t("images") }}</th>
          <th>{{ t("size") }}</th>
          <th>{{ t("duration") }}</th>
          <th>{{ t("status") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="record in records.slice(0, 20)" :key="record.requestId">
          <td>{{ new Date(record.createdAt).toLocaleString() }}</td>
          <td>
            {{
              profiles.find((p) => p.id === record.profileId)?.name ??
              record.profileId
            }}
          </td>
          <td>{{ record.model }}</td>
          <td>{{ record.images }}</td>
          <td>{{ record.size }}</td>
          <td>{{ (record.durationMs / 1000).toFixed(1) }}s</td>
          <td>{{ t(record.status) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<style scoped src="./settings-page.css"></style>
<style scoped src="./voice-settings.css"></style>
<style scoped src="./image-model-settings.css"></style>
