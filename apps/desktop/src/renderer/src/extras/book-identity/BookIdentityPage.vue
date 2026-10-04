<script setup lang="ts">
import { computed, ref } from "vue";
import AppIcon from "../../components/AppIcon.vue";
import type {
  ModelConfig,
  ChatAssistantProjectRef
} from "@deepwrite/contracts/renderer";
import AnalysisPageShell from "../analysis-ui/AnalysisPageShell.vue";
import AnalysisModelSettings from "../analysis-ui/AnalysisModelSettings.vue";
import AnalysisRunStatus from "../analysis-ui/AnalysisRunStatus.vue";
import PresetManagerShell from "../analysis-ui/PresetManagerShell.vue";
import PopupSelect from "../../components/PopupSelect.vue";
import BookPicker from "./BookPicker.vue";
import AdoptedSummary from "./AdoptedSummary.vue";
import GenerationBar from "./GenerationBar.vue";
import GenerationSettings from "./GenerationSettings.vue";
import IdentityRoundList from "./IdentityRoundList.vue";
import CandidateEditor from "./CandidateEditor.vue";
import CoverComposer from "./CoverComposer.vue";
import IdentityProfileEditor from "./IdentityProfileEditor.vue";
import { useIdentityWorkbench } from "./useIdentityWorkbench";
import { fields, fieldLabel, identityT as t } from "./book-identity-utils";
import "./book-identity.css";
const props = defineProps<{
  models: readonly ModelConfig[];
  preferredModelId: string | null;
}>();
const emit = defineEmits<{
  openBook: [book: ChatAssistantProjectRef];
  openSettings: [];
  create: [];
  refreshCatalog: [];
}>();
const {
  books,
  book,
  selected,
  field,
  c,
  record,
  loading,
  counts,
  writable,
  profiles,
  run,
  queue,
  profileId,
  count,
  brief,
  seeds,
  images,
  ratio,
  titleRendering,
  autoRender,
  model,
  modelId,
  thinkingLevel,
  imageProfile,
  ratios,
  starredOnly,
  managerOpen,
  rounds,
  editor,
  composer,
  exportTarget,
  exportOpen,
  exportSize,
  act,
  start,
  saveProfiles,
  setDefault,
  iterate,
  saveCandidate,
  saveComposition,
  render,
  exportCandidate,
  exportImage,
  rename
} = useIdentityWorkbench(props, () => emit("refreshCatalog"));
const settingsOpen = ref(false);
const generationDisabled = computed(
  () => !writable.value || profiles.loading.value || !model.value
);
</script>
<template>
  <AnalysisPageShell
    class="book-identity-page"
    :title="t('title')"
    :description="t('description')"
  >
    <template #header-actions
      ><div class="identity-header-actions">
        <button
          class="identity-profile-manager"
          :disabled="run.busy.value || profiles.loading.value"
          @click="managerOpen = true"
        >
          <AppIcon name="folder" :size="16" />{{ t("manageProfiles") }}
        </button>
        <button
          class="identity-settings-trigger"
          :disabled="!record || profiles.loading.value"
          @click="settingsOpen = true"
        >
          <AppIcon name="settings" :size="16" />{{ t("generationSettings") }}
        </button>
        <AnalysisModelSettings
          v-model:model-id="modelId"
          v-model:thinking-level="thinkingLevel"
          :models="models"
        /><button class="identity-image-model" @click="emit('openSettings')">
          {{
            imageProfile
              ? t("imageModel", { name: imageProfile.name })
              : t("configureImages")
          }}
        </button>
      </div></template
    >
    <BookPicker
      :books="books.books.value"
      :selected="selected"
      @select="books.select"
      @open="book && emit('openBook', book)"
      @create="emit('create')"
    />
    <p v-if="loading && !record">{{ t("loading") }}</p>
    <template v-if="record && book && selected">
      <section
        v-if="record.diagnostics?.foreignBookId"
        class="analysis-card identity-row"
      >
        <span>{{ t("foreign") }}</span
        ><button
          class="analysis-primary-button"
          :disabled="c.saving.value"
          @click="c.inherit"
        >
          {{ t("inherit") }}</button
        ><button
          :disabled="c.ignored.value || c.saving.value"
          @click="c.ignored.value = true"
        >
          {{ t("ignoreAction") }}</button
        ><span v-if="c.ignored.value" class="identity-muted">{{
          t("foreignIgnored")
        }}</span>
      </section>
      <AdoptedSummary
        v-if="!c.ignored.value"
        :record="record"
        :book="book"
        :book-title="selected.title"
        :active-field="field"
        :counts="counts"
        @field="field = $event"
        @rename="rename"
        @clear="c.clear"
        @export="
          exportTarget = null;
          exportOpen = true;
        "
      />
      <div class="identity-tabs" role="tablist">
        <button
          v-for="value in fields"
          :key="value"
          role="tab"
          :aria-selected="field === value"
          :class="{ 'is-active': field === value }"
          @click="field = value"
        >
          {{ fieldLabel(value) }} <small>{{ counts[value] }}</small
          ><i v-if="run.fieldBusy(value)" class="identity-running-dot" />
        </button>
      </div>
      <GenerationBar
        :field="field"
        :profile-name="profiles.selected.value?.name ?? t('profile')"
        :count="count"
        :images="images"
        :auto-render="autoRender"
        :disabled="generationDisabled"
        :saving="c.saving.value"
        :busy="run.busy.value"
        :seeds="seeds"
        :image-ready="!!imageProfile"
        :image-name="imageProfile?.name ?? t('configureImages')"
        @start="start"
        @stop="run.stop"
        @remove-seed="seeds = seeds.filter((c) => c.id !== $event)"
      >
        <AnalysisRunStatus
          :status="run.state.value.status"
          :entries="run.state.value.entries"
          :current-activity="run.state.value.activity"
          :live-output="run.state.value.output"
          :error="run.state.value.error"
          :title="t('progress')"
        />
      </GenerationBar>
      <div class="identity-row identity-record-controls">
        <div class="identity-segments">
          <button
            :class="{ 'is-active': !starredOnly }"
            @click="starredOnly = false"
          >
            {{ t("all") }}</button
          ><button
            :class="{ 'is-active': starredOnly }"
            @click="starredOnly = true"
          >
            {{ t("starredOnly") }}
          </button>
        </div>
        <div
          class="identity-actions"
          :class="{ 'identity-save-pending': c.saving.value && writable }"
          :aria-busy="c.saving.value"
        >
          <button
            v-if="field !== 'cover'"
            :disabled="!writable || c.saving.value"
            @click="editor = {}"
          >
            {{ t("addManual") }}</button
          ><button
            :disabled="!writable || c.saving.value"
            class="identity-danger"
            @click="c.prune(field)"
          >
            {{ t("prune") }}</button
          ><button v-if="queue.pendingFor(book)" @click="queue.stop(book)">
            {{ t("stopImages") }}
          </button>
        </div>
      </div>
      <p v-if="!rounds.length" class="identity-empty">{{ t("empty") }}</p>
      <IdentityRoundList
        :controller="c"
        :book="book"
        :rounds="rounds"
        :starred-only="starredOnly"
        @edit="(round, candidate) => (editor = { round, candidate })"
        @iterate="iterate"
        @render="render"
        @compose="
          (round, candidate, image) => (composer = { round, candidate, image })
        "
        @export="exportCandidate"
      />
      <small class="identity-muted">{{ t("privacy") }}</small>
      <CandidateEditor
        :open="!!editor"
        :field="field"
        :candidate="editor?.candidate"
        :saving="c.saving.value"
        @close="editor = null"
        @save="saveCandidate"
      />
      <CoverComposer
        v-if="composer"
        :open="true"
        :book="book"
        :image="composer.image"
        :title="record.adopted.title?.title ?? selected.title"
        :subtitle="record.adopted.title?.subtitle"
        :palette="composer.candidate.palette"
        :saving="c.saving.value"
        @close="composer = null"
        @save="saveComposition"
      />
    </template>
    <GenerationSettings
      v-model:field="field"
      v-model:profile-id="profileId"
      v-model:count="count"
      v-model:brief="brief"
      v-model:images="images"
      v-model:ratio="ratio"
      v-model:title-rendering="titleRendering"
      v-model:auto-render="autoRender"
      :open="settingsOpen"
      :profiles="profiles.profiles.value"
      :disabled="generationDisabled || c.saving.value || profiles.saving.value"
      :busy="run.busy.value"
      :ratios="ratios"
      @close="settingsOpen = false"
      @set-default="setDefault"
    />
    <IdentityProfileEditor
      v-model:field="field"
      :open="managerOpen"
      :catalogs="profiles.catalogs.value"
      :saving="profiles.saving.value"
      @close="managerOpen = false"
      @save="saveProfiles"
      @reset="act(() => profiles.reset($event))"
    />
    <PresetManagerShell
      :open="exportOpen"
      :title="t('export')"
      :close-label="t('close')"
      @close="exportOpen = false"
      ><div class="identity-editor">
        <PopupSelect
          v-model="exportSize"
          :options="[
            { value: 'original', label: t('original') },
            { value: '600x800', label: '600 × 800' },
            { value: '1080x1440', label: '1080 × 1440' }
          ]"
          :accessible-label="t('export')"
        />
      </div>
      <template #footer
        ><button @click="exportOpen = false">{{ t("cancel") }}</button
        ><button class="analysis-primary-button" @click="exportImage">
          {{ t("export") }}
        </button></template
      ></PresetManagerShell
    >
  </AnalysisPageShell>
</template>
