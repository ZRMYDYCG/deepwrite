<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import {
  SUBAGENT_AUTHORING_MAX_SKILLS,
  SUBAGENT_AUTHORING_SKILL_BODY_MAX_LENGTH,
  type SkillLibrary,
  type SkillStageId,
  type SubagentAuthoringDraft,
  type SubagentAuthoringOutputMode,
  type SubagentAuthoringParentAgentId,
  type SubagentAuthoringRuntimeContext
} from "@deepwrite/contracts";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { uiMessage } from "../ui-feedback";
import PopupSelect, { type PopupSelectOption } from "./PopupSelect.vue";

const t = createScopedTranslator("components.loadSubagentFromSkillDialog");

export interface SubagentAuthoringSkillOption {
  id: string;
  libraryId: string;
  entryId: string;
  libraryTitle: string;
  title: string;
  body: string;
  stageId: SkillStageId;
}

const SUBAGENT_AUTHORING_OUTPUT_MODE_LABELS = {
  get write() {
    return t("writeDocuments");
  },
  get handoff() {
    return t("returnConclusions");
  }
};

const props = defineProps<{
  open: boolean;
  parentAgentId: SubagentAuthoringParentAgentId;
  parentAgentLabel: string;
  existingSubagentNames: readonly string[];
  skills: readonly SkillLibrary[];
  models: readonly { id: string; label: string }[];
  preferredModelId: string | null;
  generating: boolean;
  draft: SubagentAuthoringDraft | null;
  statusText: string | null;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  generate: [
    payload: {
      context: SubagentAuthoringRuntimeContext;
      modelId: string;
    }
  ];
  stop: [];
  confirm: [draft: SubagentAuthoringDraft];
}>();

const selectedSkillIds = ref<string[]>([]);
const outputMode = ref<SubagentAuthoringOutputMode>("handoff");
const modelId = ref("");
const draftName = ref("");
const draftDescription = ref("");
const draftSystemPrompt = ref("");

watch(
  () => [props.open, props.error] as const,
  ([open, error], previous) => {
    if (open && error && (!previous || !previous[0] || previous[1] !== error)) {
      uiMessage.error(error);
    }
  }
);

const skillOptions = computed<SubagentAuthoringSkillOption[]>(() => {
  const options: SubagentAuthoringSkillOption[] = [];
  for (const library of props.skills) {
    for (const entry of library.entries) {
      options.push({
        id: `skill:${library.id}:${entry.id}`,
        libraryId: library.id,
        entryId: entry.id,
        libraryTitle: library.title,
        title: entry.title,
        body: entry.body.slice(0, SUBAGENT_AUTHORING_SKILL_BODY_MAX_LENGTH),
        stageId: entry.stageId
      });
    }
  }
  return options;
});

const modelOptions = computed<PopupSelectOption[]>(() =>
  props.models.map((model) => ({ value: model.id, label: model.label }))
);

const selectedSkills = computed(() =>
  skillOptions.value.filter((skill) =>
    selectedSkillIds.value.includes(skill.id)
  )
);

const canGenerate = computed(
  () =>
    !props.generating &&
    selectedSkills.value.length > 0 &&
    Boolean(modelId.value) &&
    Boolean(outputMode.value)
);

const canConfirm = computed(
  () =>
    !props.generating &&
    draftName.value.trim() &&
    draftDescription.value.trim() &&
    draftSystemPrompt.value.trim()
);

function toggleSkill(skillId: string): void {
  if (props.generating) return;
  const index = selectedSkillIds.value.indexOf(skillId);
  if (index >= 0) {
    selectedSkillIds.value = selectedSkillIds.value.filter(
      (id) => id !== skillId
    );
    return;
  }
  if (selectedSkillIds.value.length >= SUBAGENT_AUTHORING_MAX_SKILLS) {
    uiMessage.warning(
      t("selectUpToValueSkillsAtOnce", {
        arg0: SUBAGENT_AUTHORING_MAX_SKILLS
      })
    );
    return;
  }
  selectedSkillIds.value = [...selectedSkillIds.value, skillId];
}

function requestClose(): void {
  if (props.generating) {
    uiMessage.warning(t("generationIsRunningStopItBeforeClosing"));
    return;
  }
  emit("close");
}

function generate(): void {
  if (!canGenerate.value) {
    if (!selectedSkills.value.length)
      uiMessage.warning(t("selectAtLeastOneSkill"));
    else if (!modelId.value) uiMessage.warning(t("selectAGenerationModel"));
    return;
  }
  emit("generate", {
    modelId: modelId.value,
    context: {
      parentAgentId: props.parentAgentId,
      parentAgentLabel: props.parentAgentLabel,
      outputMode: outputMode.value,
      skills: selectedSkills.value.map((skill) => ({
        id: skill.id,
        libraryId: skill.libraryId,
        entryId: skill.entryId,
        title: skill.title,
        libraryTitle: skill.libraryTitle,
        body: skill.body
      })),
      existingSubagentNames: [...props.existingSubagentNames]
    }
  });
}

function confirmDraft(): void {
  if (!canConfirm.value) {
    uiMessage.warning(t("generateAndCompleteTheSubagentDraftFirst"));
    return;
  }
  emit("confirm", {
    name: draftName.value.trim(),
    description: draftDescription.value.trim(),
    systemPrompt: draftSystemPrompt.value.trim()
  });
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === "Escape") requestClose();
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    selectedSkillIds.value = [];
    outputMode.value = "handoff";
    modelId.value =
      (props.preferredModelId &&
      props.models.some((model) => model.id === props.preferredModelId)
        ? props.preferredModelId
        : props.models[0]?.id) ?? "";
    draftName.value = "";
    draftDescription.value = "";
    draftSystemPrompt.value = "";
  }
);

watch(
  () => props.draft,
  (draft) => {
    if (!draft) return;
    draftName.value = draft.name;
    draftDescription.value = draft.description;
    draftSystemPrompt.value = draft.systemPrompt;
  }
);

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @mousedown.self="requestClose">
      <section
        class="workspace-dialog load-subagent-skill-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="load-subagent-skill-title"
      >
        <header>
          <div>
            <span class="dialog-eyebrow">{{
              t("agentTeamsSkillsToSubagent")
            }}</span>
            <h2 id="load-subagent-skill-title">
              {{ t("loadFromSkillLibrary") }}
            </h2>
            <p>
              {{
                t("generateASubagentDraftForFromSkillsMessage", {
                  arg0: parentAgentLabel ?? ""
                })
              }}
            </p>
          </div>
          <button
            class="dialog-close"
            type="button"
            :aria-label="t('close')"
            :disabled="generating"
            @click="requestClose"
          >
            ×
          </button>
        </header>

        <div class="dialog-content authoring-body">
          <section class="authoring-section">
            <div class="section-heading">
              <strong>{{ t("text1SelectSkills") }}</strong>
            </div>
            <p class="section-hint">
              {{ t("chooseSkillsFromAnyLibraryOrStageTheirContent") }}
            </p>
            <div v-if="!skillOptions.length" class="empty-skills">
              {{ t("noSkillEntriesAvailableAddSkillsToTheLibrary") }}
            </div>
            <ul v-else class="skill-list">
              <li v-for="skill in skillOptions" :key="skill.id">
                <label>
                  <input
                    type="checkbox"
                    :checked="selectedSkillIds.includes(skill.id)"
                    :disabled="generating"
                    @change="toggleSkill(skill.id)"
                  />
                  <span>
                    <strong>{{ skill.title }}</strong>
                    <em>{{ skill.libraryTitle }}</em>
                  </span>
                </label>
              </li>
            </ul>
          </section>

          <section class="authoring-section">
            <strong>{{ t("text2ConfirmOutputMethod") }}</strong>
            <p class="section-hint">
              {{ t("thisDeterminesWhetherTheGeneratedSystemPromptDirectsThe") }}
            </p>
            <div
              class="mode-options"
              role="radiogroup"
              :aria-label="t('outputMethod')"
            >
              <label
                v-for="mode in ['write', 'handoff'] as const"
                :key="mode"
                :class="{ 'is-selected': outputMode === mode }"
              >
                <input
                  v-model="outputMode"
                  type="radio"
                  name="subagent-output-mode"
                  :value="mode"
                  :disabled="generating"
                />
                <span>
                  <strong>{{
                    SUBAGENT_AUTHORING_OUTPUT_MODE_LABELS[mode]
                  }}</strong>
                  <em v-if="mode === 'write'">{{
                    t("theSubagentEditsDocumentsWithWriteReplaceToolsAnd")
                  }}</em>
                  <em v-else>{{
                    t("theSubagentReportsConclusionsAndKeyPointsWithoutEditing")
                  }}</em>
                </span>
              </label>
            </div>
          </section>

          <section class="authoring-section">
            <strong>{{ t("text3GenerateDraft") }}</strong>
            <label class="form-field">
              <span>{{ t("generationModel") }}</span>
              <PopupSelect
                :model-value="modelId"
                :options="modelOptions"
                :accessible-label="t('generationModel')"
                :disabled="generating || !modelOptions.length"
                :placeholder="t('selectModel')"
                @update:model-value="modelId = String($event)"
              />
            </label>
            <div class="generate-row">
              <button
                type="button"
                class="primary-button"
                :disabled="!canGenerate"
                @click="generate"
              >
                {{ generating ? t("generating") : t("generateSubagentDraft") }}
              </button>
              <button
                type="button"
                class="secondary-button authoring-stop-button"
                :class="{ 'is-placeholder': !generating }"
                :disabled="!generating"
                :aria-hidden="!generating"
                @click="emit('stop')"
              >
                {{ t("stop") }}
              </button>
            </div>
            <div class="authoring-status-slot" aria-live="polite">
              <p
                v-if="statusText && !error"
                class="status-text"
                :title="statusText"
              >
                {{ statusText }}
              </p>
            </div>
          </section>

          <section
            v-if="draft || draftName"
            class="authoring-section draft-section"
          >
            <strong>{{ t("text4ReviewDraft") }}</strong>
            <label class="form-field">
              <span>{{ t("name") }}</span>
              <input
                v-model="draftName"
                type="text"
                :disabled="generating"
                maxlength="80"
              />
            </label>
            <label class="form-field">
              <span>{{ t("capabilities") }}</span>
              <textarea
                v-model="draftDescription"
                rows="3"
                :disabled="generating"
                maxlength="1000"
              />
            </label>
            <label class="form-field">
              <span>{{ t("systemPrompt") }}</span>
              <textarea
                v-model="draftSystemPrompt"
                rows="10"
                :disabled="generating"
                maxlength="20000"
              />
            </label>
          </section>
        </div>

        <footer class="dialog-actions">
          <button
            type="button"
            class="secondary-button"
            :disabled="generating"
            @click="requestClose"
          >
            {{ t("cancel") }}
          </button>
          <button
            type="button"
            class="primary-button"
            :disabled="!canConfirm"
            @click="confirmDraft"
          >
            {{ t("addToTeamDraft") }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.load-subagent-skill-dialog {
  width: min(720px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: var(--surface-raised);
  color: var(--text-primary);
  border: 1px solid var(--theme-line);
  border-radius: 16px;
  overflow: hidden;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--text-primary) 28%, transparent);
  padding: 24px;
}

header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 12px;
  border-bottom: 1px solid var(--theme-line-soft);
}

.dialog-eyebrow {
  display: block;
  color: var(--text-tertiary);
  font-size: 12px;
  margin-bottom: 4px;
}

header h2 {
  margin: 0;
  font-size: 1.25rem;
}

header p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 0.92rem;
  line-height: 1.45;
}

.dialog-close {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.authoring-body {
  overflow: auto;
  padding: 16px 22px;
  display: grid;
  gap: 18px;
}

.authoring-section {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 12px;
  background: var(--surface-muted);
}

.section-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.section-hint,
.status-text {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.88rem;
  line-height: 1.45;
}

.authoring-stop-button.is-placeholder {
  visibility: hidden;
}

.generate-row .primary-button {
  min-width: 10.5rem;
}

.authoring-status-slot {
  height: 2.65rem;
  overflow: hidden;
}

.authoring-status-slot .status-text {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.empty-skills {
  padding: 16px;
  border-radius: 10px;
  background: var(--surface-main);
  color: var(--text-secondary);
}

.skill-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  max-height: 180px;
  overflow: auto;
}

.skill-list label {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--surface-main);
  border: 1px solid var(--theme-line-soft);
  cursor: pointer;
}

.skill-list strong {
  display: block;
}

.skill-list em {
  display: block;
  margin-top: 2px;
  font-style: normal;
  color: var(--text-tertiary);
  font-size: 0.84rem;
}

.mode-options {
  display: grid;
  gap: 8px;
}

.mode-options label {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--theme-line-soft);
  background: var(--surface-main);
  cursor: pointer;
}

.mode-options label.is-selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.mode-options strong,
.mode-options em {
  display: block;
}

.mode-options em {
  margin-top: 4px;
  font-style: normal;
  color: var(--text-secondary);
  font-size: 0.86rem;
}

.form-field {
  display: grid;
  gap: 6px;
}

.form-field > span {
  color: var(--text-secondary);
  font-size: 0.86rem;
}

.form-field input,
.form-field textarea {
  width: 100%;
  border: 1px solid var(--theme-line);
  border-radius: 10px;
  background: var(--surface-main);
  color: var(--text-primary);
  padding: 10px 12px;
  font: inherit;
  resize: vertical;
}

.generate-row,
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-actions {
  padding: 14px 22px 18px;
  border-top: 1px solid var(--theme-line-soft);
}

.primary-button,
.secondary-button {
  border-radius: 10px;
  padding: 8px 14px;
  font: inherit;
  cursor: pointer;
}

.primary-button {
  border: none;
  background: var(--text-primary);
  color: var(--surface-main);
}

.primary-button:disabled,
.secondary-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.secondary-button {
  border: 1px solid var(--theme-line);
  background: var(--surface-raised);
  color: var(--text-primary);
}
</style>
