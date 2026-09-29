<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import BuiltinSubagentSettings from "./BuiltinSubagentSettings.vue";
import {
  AGENT_TEAM_PROFILE_NAME_MAX_LENGTH,
  type AgentTeamCatalogSnapshot,
  type AgentTeamProfile,
  type AgentTeamProfileSaveInput,
  type AgentTeamWorkspaceType,
  type LongAgentTeamSettings,
  type ModelConfig,
  type SkillLibrary,
  type SubagentAuthoringDraft,
  type SubagentAuthoringRuntimeContext,
  type WorkspaceAgentTeamSettings
} from "@deepwrite/contracts";
import { computed, ref, watch } from "vue";
import { uiMessage } from "../ui-feedback";
import AgentTeamSettingsPanel from "./AgentTeamSettingsPanel.vue";
import AppIcon from "./AppIcon.vue";
import PopupSelect, { type PopupSelectOption } from "./PopupSelect.vue";

const t = createScopedTranslator("components.agentTeamCatalogFeature");

const props = defineProps<{
  catalog: AgentTeamCatalogSnapshot | null;
  navigationEpoch: number;
  models: readonly ModelConfig[];
  skills?: readonly SkillLibrary[];
  preferredModelId?: string | null;
  loading: boolean;
  saving: boolean;
  loadError?: string | null;
  runtimeAvailable: boolean;
  authoringGenerating?: boolean;
  authoringDraft?: SubagentAuthoringDraft | null;
  authoringStatusText?: string | null;
  authoringError?: string | null;
}>();

const emit = defineEmits<{
  retry: [];
  create: [input: { name: string; workspaceType: AgentTeamWorkspaceType }];
  rename: [input: { teamId: string; name: string }];
  delete: [input: { teamId: string }];
  download: [input: { teamId: string }];
  install: [];
  setEnabled: [input: { teamId: string; enabled: boolean }];
  save: [input: AgentTeamProfileSaveInput];
  authoringGenerate: [
    payload: { context: SubagentAuthoringRuntimeContext; modelId: string }
  ];
  authoringStop: [];
  authoringReset: [];
}>();

const selectedTeamId = ref<string | null>(null);
const dialogMode = ref<"create" | "rename" | "delete" | null>(null);
const dialogTeam = ref<AgentTeamProfile | null>(null);
const nameDraft = ref("");
const createWorkspaceType = ref<AgentTeamWorkspaceType>("short");
const pendingCreatedName = ref<string | null>(null);
let pendingExistingTeamIds = new Set<string>();

const selectedTeam = computed(
  () =>
    props.catalog?.teams.find((team) => team.id === selectedTeamId.value) ??
    null
);
const editorSettings = computed<WorkspaceAgentTeamSettings[]>(() =>
  selectedTeam.value && selectedTeam.value.workspaceType !== "long"
    ? [selectedTeam.value.settings]
    : []
);
const editorLongSettings = computed<LongAgentTeamSettings | null>(() =>
  selectedTeam.value?.workspaceType === "long"
    ? selectedTeam.value.settings
    : null
);
const workspaceTypeOptions: PopupSelectOption[] = [
  {
    value: "short",
    get label() {
      return t("shortStory");
    }
  },
  {
    value: "script",
    get label() {
      return t("screenplay");
    }
  },
  {
    value: "long",
    get label() {
      return t("novel");
    }
  }
];
const catalogTeams = computed(() => props.catalog?.teams ?? []);

watch(
  () => props.catalog,
  (catalog) => {
    if (
      selectedTeamId.value &&
      !catalog?.teams.some((team) => team.id === selectedTeamId.value)
    ) {
      selectedTeamId.value = null;
    }
    if (pendingCreatedName.value) {
      const created = catalog?.teams.find(
        (team) =>
          team.name === pendingCreatedName.value &&
          !pendingExistingTeamIds.has(team.id)
      );
      if (created) {
        selectedTeamId.value = created.id;
      }
      pendingCreatedName.value = null;
      pendingExistingTeamIds = new Set();
    }
  }
);

watch(
  () => props.navigationEpoch,
  () => {
    if (selectedTeamId.value) emit("authoringReset");
    selectedTeamId.value = null;
    closeDialog();
  }
);

function subagentCount(team: AgentTeamProfile): number {
  return team.settings.teams.reduce(
    (total, item) => total + item.subagents.length,
    0
  );
}

function workspaceTypeLabel(workspaceType: AgentTeamWorkspaceType): string {
  return workspaceType === "short"
    ? t("shortStory")
    : workspaceType === "script"
      ? t("screenplay")
      : t("novel");
}

function isEnabled(team: AgentTeamProfile): boolean {
  return props.catalog?.enabledTeamIds[team.workspaceType] === team.id;
}

function openCreate(): void {
  dialogMode.value = "create";
  dialogTeam.value = null;
  nameDraft.value = "";
  createWorkspaceType.value = "short";
}

function openRename(team: AgentTeamProfile): void {
  dialogMode.value = "rename";
  dialogTeam.value = team;
  nameDraft.value = team.name;
}

function openDelete(team: AgentTeamProfile): void {
  dialogMode.value = "delete";
  dialogTeam.value = team;
}

function closeDialog(): void {
  if (props.saving) return;
  dialogMode.value = null;
  dialogTeam.value = null;
  nameDraft.value = "";
}

function submitName(): void {
  const name = nameDraft.value.trim();
  if (!name) {
    uiMessage.warning(t("enterATeamName"));
    return;
  }
  if (dialogMode.value === "create") {
    pendingCreatedName.value = name;
    pendingExistingTeamIds = new Set(
      props.catalog?.teams.map((team) => team.id)
    );
    emit("create", { name, workspaceType: createWorkspaceType.value });
  } else if (dialogMode.value === "rename" && dialogTeam.value) {
    emit("rename", { teamId: dialogTeam.value.id, name });
  }
  dialogMode.value = null;
}

function confirmDelete(): void {
  if (!dialogTeam.value) return;
  emit("delete", { teamId: dialogTeam.value.id });
  dialogMode.value = null;
}

function leaveEditor(): void {
  emit("authoringReset");
  selectedTeamId.value = null;
}
</script>

<template>
  <div v-if="selectedTeam" class="team-detail">
    <header class="detail-navigation">
      <button type="button" class="back-button" @click="leaveEditor">
        <AppIcon name="chevron" :size="14" />
        <span>{{ t("backToTeams") }}</span>
      </button>
      <strong>{{ selectedTeam.name }}</strong>
      <span class="type-badge">{{
        workspaceTypeLabel(selectedTeam.workspaceType)
      }}</span>
      <span v-if="isEnabled(selectedTeam)" class="active-badge">{{
        t("enabled")
      }}</span>
    </header>
    <AgentTeamSettingsPanel
      :workspace-type="selectedTeam.workspaceType"
      :settings="editorSettings"
      :long-settings="editorLongSettings"
      :models="models"
      :skills="skills ?? []"
      :preferred-model-id="preferredModelId ?? null"
      :loading="loading"
      :saving="saving"
      :load-error="loadError ?? null"
      :long-loading="loading"
      :long-saving="saving"
      :long-load-error="loadError ?? null"
      :runtime-available="runtimeAvailable"
      :authoring-generating="Boolean(authoringGenerating)"
      :authoring-draft="authoringDraft ?? null"
      :authoring-status-text="authoringStatusText ?? null"
      :authoring-error="authoringError ?? null"
      @retry="emit('retry')"
      @save="emit('save', { teamId: selectedTeam.id, settings: $event })"
      @save-long="emit('save', { teamId: selectedTeam.id, settings: $event })"
      @authoring-generate="emit('authoringGenerate', $event)"
      @authoring-stop="emit('authoringStop')"
      @authoring-reset="emit('authoringReset')"
    />
  </div>

  <section v-else class="team-catalog" aria-labelledby="team-catalog-title">
    <header class="catalog-header">
      <div>
        <span>{{ t("learnAndImitateAgentTeams") }}</span>
        <h2 id="team-catalog-title">
          {{ t("agentTeams") }}
        </h2>
        <p>
          {{ t("eachTeamServesOneWritingTypeEnableAtMost") }}
        </p>
      </div>
      <div class="catalog-header-actions">
        <button
          type="button"
          class="secondary-button"
          :disabled="saving || !runtimeAvailable"
          @click="emit('install')"
        >
          <AppIcon name="archive" :size="16" />
          {{ t("installTeam") }}
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="saving || !runtimeAvailable"
          @click="openCreate"
        >
          <AppIcon name="plus" :size="16" />
          {{ t("newTeam") }}
        </button>
      </div>
    </header>

    <BuiltinSubagentSettings
      v-if="catalog"
      :settings="catalog.builtinSubagents"
      :disabled="loading || saving || !runtimeAvailable"
    />
    <h2 id="creative-teams-title" class="team-section-title">
      {{ t("writingTeams") }}
    </h2>
    <div v-if="loading" class="catalog-state">
      {{ t("loadingAgentTeams") }}
    </div>
    <div v-else-if="loadError && !catalog" class="catalog-state" role="alert">
      <strong>{{ t("agentTeamsHaveNotLoaded") }}</strong>
      <p>{{ loadError }}</p>
      <button type="button" class="secondary-button" @click="emit('retry')">
        {{ t("reload") }}
      </button>
    </div>
    <div v-else class="team-grid">
      <article
        v-for="team in catalogTeams"
        :key="team.id"
        class="team-card"
        :class="{ 'is-active': isEnabled(team) }"
        @click="selectedTeamId = team.id"
      >
        <div class="team-card-top">
          <button
            type="button"
            class="enable-selector"
            :class="{ 'is-selected': isEnabled(team) }"
            :disabled="saving || !runtimeAvailable"
            :aria-label="
              t('teamToggleLabel', {
                action: isEnabled(team) ? t('disable') : t('enable'),
                name: team.name
              })
            "
            :aria-pressed="isEnabled(team)"
            :title="
              isEnabled(team)
                ? t('disableTeam')
                : t('enableThisValueTeam', {
                    arg0: workspaceTypeLabel(team.workspaceType)
                  })
            "
            @click.stop="
              emit('setEnabled', { teamId: team.id, enabled: !isEnabled(team) })
            "
          >
            <AppIcon v-if="isEnabled(team)" name="check" :size="14" />
          </button>
          <button
            type="button"
            class="team-card-main"
            @click.stop="selectedTeamId = team.id"
          >
            <span class="team-title-row">
              <strong>{{ team.name }}</strong>
              <span class="type-badge">{{
                workspaceTypeLabel(team.workspaceType)
              }}</span>
            </span>
            <span class="team-counts">{{
              t("subagentsMessage", {
                arg0: subagentCount(team) ?? ""
              })
            }}</span>
          </button>
        </div>
        <div class="team-actions">
          <button
            type="button"
            :disabled="saving || !runtimeAvailable"
            @click.stop="emit('download', { teamId: team.id })"
          >
            <AppIcon name="download" :size="13" />
            {{ t("download") }}
          </button>
          <button
            type="button"
            :disabled="saving || !runtimeAvailable"
            @click.stop="openRename(team)"
          >
            {{ t("rename") }}
          </button>
          <button
            type="button"
            class="delete-button"
            :disabled="saving || !runtimeAvailable || isEnabled(team)"
            :title="
              isEnabled(team) ? t('disableThisTeamFirst') : t('deleteTeam')
            "
            @click.stop="openDelete(team)"
          >
            {{ t("delete") }}
          </button>
        </div>
      </article>
    </div>
  </section>

  <Teleport to="body">
    <div v-if="dialogMode" class="dialog-backdrop" @click.self="closeDialog">
      <section class="team-dialog" role="dialog" aria-modal="true">
        <template v-if="dialogMode === 'delete'">
          <h3>
            {{
              t("deleteMessageDetail", {
                arg0: dialogTeam?.name ?? ""
              })
            }}
          </h3>
          <p>
            {{
              t("theSubagentSettingsInThisTeamWillMessage", {
                arg0:
                  workspaceTypeLabel(dialogTeam?.workspaceType ?? "short") ?? ""
              })
            }}
          </p>
          <div class="dialog-actions">
            <button type="button" @click="closeDialog">
              {{ t("cancel") }}
            </button>
            <button
              type="button"
              class="danger-button"
              :disabled="saving"
              @click="confirmDelete"
            >
              {{ t("deleteMessage") }}
            </button>
          </div>
        </template>
        <template v-else>
          <h3>
            {{
              dialogMode === "create" ? t("newAgentTeam") : t("renameAgentTeam")
            }}
          </h3>
          <label>
            {{ t("teamName") }}
            <input
              v-model="nameDraft"
              :maxlength="AGENT_TEAM_PROFILE_NAME_MAX_LENGTH"
              autofocus
              @keyup.enter="submitName"
            />
          </label>
          <label v-if="dialogMode === 'create'">
            {{ t("writingType") }}
            <PopupSelect
              v-model="createWorkspaceType"
              :options="workspaceTypeOptions"
              :accessible-label="t('teamWritingType')"
              :menu-z-index="2200"
            />
          </label>
          <div class="dialog-actions">
            <button type="button" @click="closeDialog">
              {{ t("cancel") }}
            </button>
            <button
              type="button"
              class="primary-button"
              :disabled="saving"
              @click="submitName"
            >
              {{ t("confirm") }}
            </button>
          </div>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<style scoped src="./AgentTeamCatalogFeature.css"></style>
