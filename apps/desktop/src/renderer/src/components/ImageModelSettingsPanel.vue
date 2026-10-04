<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import PopupSelect from "./PopupSelect.vue";
import ImageModelProfileFields from "./ImageModelProfileFields.vue";
import ImageModelUsagePanel from "./ImageModelUsagePanel.vue";
import { useImageModelSettings } from "../composables/useImageModelSettings";
import { createScopedTranslator } from "../i18n";
const t = createScopedTranslator("components.imageModelSettings");
defineProps<{ runtimeAvailable: boolean }>();
const c = useImageModelSettings();
const {
  draft,
  current,
  settings,
  loading,
  saving,
  loaded,
  testRequestId,
  preview,
  usage
} = c;
const prompt = ref("");
const options = computed(() =>
  settings.value.profiles
    .filter((p) => p.hasApiKey)
    .map((p) => ({ value: p.id, label: p.name, description: p.model }))
);
onMounted(() => {
  void c.load();
  void c.refreshUsage();
});
</script>
<template>
  <section class="settings-group">
    <h2 class="settings-group-title">{{ t("current") }}</h2>
    <div v-if="!draft" class="settings-card">
      <div class="settings-item image-current-model">
        <span class="settings-item-text"
          ><strong>{{ current?.name ?? t("noModel") }}</strong
          ><small>{{ current?.model }}</small></span
        >
        <PopupSelect
          v-if="options.length"
          :model-value="settings.activeProfileId ?? ''"
          :options="options"
          :accessible-label="t('current')"
          :disabled="saving || !!testRequestId"
          @update:model-value="c.select(String($event))"
        />
      </div>
      <div class="settings-item">
        <small class="settings-item-text">{{ t("privacy") }}</small>
        <div class="voice-model-actions">
          <button
            v-if="current"
            class="voice-button"
            :disabled="saving || !!testRequestId"
            @click="c.edit()"
          >
            {{ t("edit") }}
          </button>
          <button
            v-if="current"
            class="voice-button image-danger"
            :disabled="saving || !!testRequestId"
            @click="c.remove()"
          >
            {{ t("delete") }}
          </button>
          <button
            class="voice-button is-primary"
            :disabled="
              !loaded ||
              saving ||
              !!testRequestId ||
              settings.profiles.length >= 12
            "
            @click="c.edit(true)"
          >
            {{ t("add") }}
          </button>
          <button
            v-if="!loaded"
            class="voice-button"
            :disabled="loading || !runtimeAvailable"
            @click="c.load"
          >
            {{ t("reload") }}
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="!draft && settings.profiles.length"
      class="settings-card image-config-list"
    >
      <div
        v-for="profile in settings.profiles"
        :key="profile.id"
        class="settings-item"
      >
        <span class="settings-item-text"
          ><strong>{{ profile.name }}</strong
          ><small>{{ profile.model }}</small></span
        >
        <div class="voice-model-actions">
          <button
            class="voice-button"
            :disabled="saving || !!testRequestId"
            @click="c.edit(false, profile.id)"
          >
            {{ t("edit") }}</button
          ><button
            class="voice-button image-danger"
            :disabled="saving || !!testRequestId"
            @click="c.remove(profile.id)"
          >
            {{ t("delete") }}
          </button>
        </div>
      </div>
    </div>
    <form v-if="draft" class="settings-card" @submit.prevent="c.save">
      <fieldset :disabled="saving">
        <ImageModelProfileFields :configuration="c" />
      </fieldset>
      <div class="settings-item">
        <small>{{ t("privacy") }}</small>
        <div class="voice-model-actions">
          <button
            type="button"
            class="voice-button"
            :disabled="saving"
            @click="draft = null"
          >
            {{ t("cancel") }}</button
          ><button class="voice-button is-primary" :disabled="saving">
            {{ saving ? t("saving") : t("save") }}
          </button>
        </div>
      </div>
    </form>
    <h2 class="settings-group-title">{{ t("testTitle") }}</h2>
    <div class="settings-card image-test">
      <label
        ><span>{{ t("prompt") }}</span
        ><textarea
          v-model="prompt"
          rows="3"
          maxlength="8000"
          :placeholder="t('promptPlaceholder')"
          :disabled="!!testRequestId"
        />
      </label>
      <button v-if="testRequestId" class="voice-button" @click="c.stop">
        {{ t("stop") }}</button
      ><button
        v-else
        class="voice-button is-primary"
        :disabled="
          !runtimeAvailable || !current?.hasApiKey || !prompt.trim() || !!draft
        "
        @click="c.test(prompt)"
      >
        {{ t("test") }}
      </button>
      <img v-if="preview" :src="preview" :alt="t('testAlt')" />
    </div>
    <ImageModelUsagePanel
      :records="usage"
      :profiles="settings.profiles"
      @refresh="c.refreshUsage"
    />
  </section>
</template>
<style scoped src="./settings-page.css"></style>
<style scoped src="./voice-settings.css"></style>
<style scoped src="./image-model-settings.css"></style>
