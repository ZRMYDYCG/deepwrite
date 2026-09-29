<script setup lang="ts">
import { computed } from "vue";
import { createScopedTranslator } from "../i18n";

const t = createScopedTranslator("components.workspaceAgentProfileForm");
interface EditableProfile {
  systemPrompt: string;
  welcomeShortcuts: readonly string[];
  readAccess: { material: readonly string[]; skill: readonly string[] };
}

interface DefaultPlotStageOption {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  locked?: boolean;
}

const props = defineProps<{
  agent: EditableProfile;
  label: string;
  description: string;
  eyebrow: string;
  disabled: boolean;
  saving: boolean;
  saveLabel: string;
  showWelcomeShortcuts?: boolean;
  defaultPlotStages?: readonly DefaultPlotStageOption[];
}>();

const emit = defineEmits<{
  prompt: [value: string];
  shortcut: [index: number, value: string];
  access: [scope: "material" | "skill", id: string, checked: boolean];
  defaultPlotStage: [id: string, enabled: boolean];
  reset: [];
  save: [];
}>();

const MATERIAL_OPTIONS = computed(
  () =>
    [
      ["character", t("characterMaterials"), t("characterDesignReferences")],
      ["gimmick", t("hookMaterials"), t("genreHooksAndCreativeIdeas")],
      ["plot", t("plotMaterials"), t("plotStructuresAndSceneReferences")],
      [
        "draft",
        t("manuscriptMaterials"),
        t("manuscriptExcerptsAndProseReferences")
      ],
      ["other", t("otherMaterials"), t("materialsOutsideTheCategoriesAbove")]
    ] as const
);

const SKILL_OPTIONS = computed(
  () =>
    [
      ["general", t("generalSkills"), t("reusableCapabilitiesAcrossStages")],
      ["plot", t("plotSkills"), t("characterPlotAndStructuralDesign")],
      ["style", t("styleSkills"), t("proseAndWritingStyleExecution")],
      ["other", t("otherSkills"), t("skillsOutsideTheCategoriesAbove")]
    ] as const
);

function checked(scope: "material" | "skill", id: string): boolean {
  return props.agent.readAccess[scope].includes(id);
}
</script>

<template>
  <div class="profile-editor">
    <header class="profile-header">
      <span>{{ eyebrow }}</span>
      <h3>{{ label }}</h3>
      <p>{{ description }}</p>
    </header>

    <section class="profile-card prompt-card">
      <div class="section-heading">
        <div>
          <h4>{{ t("systemPrompt") }}</h4>
          <p>
            {{ t("theWorkCurrentStageAndToolBoundariesAreAdded") }}
          </p>
        </div>
        <span>{{
          t("charactersMessage", {
            arg0: agent.systemPrompt.length ?? ""
          })
        }}</span>
      </div>
      <textarea
        :value="agent.systemPrompt"
        :disabled="disabled"
        spellcheck="false"
        :aria-label="t('systemPrompt')"
        @input="emit('prompt', ($event.target as HTMLTextAreaElement).value)"
      />
    </section>

    <section v-if="showWelcomeShortcuts !== false" class="profile-card">
      <div class="section-heading">
        <div>
          <h4>
            {{ t("welcomeShortcuts") }}
          </h4>
          <p>
            {{ t("threeQuickPromptsShownWhenAConversationIsEmpty") }}
          </p>
        </div>
      </div>
      <div class="shortcut-list">
        <label v-for="(shortcut, index) in agent.welcomeShortcuts" :key="index">
          <span>{{
            t("buttonMessage", {
              arg0: index + 1
            })
          }}</span>
          <input
            :value="shortcut"
            type="text"
            maxlength="120"
            :disabled="disabled"
            @input="
              emit('shortcut', index, ($event.target as HTMLInputElement).value)
            "
          />
        </label>
      </div>
    </section>

    <section class="profile-card access-card">
      <div class="section-heading">
        <div>
          <h4>{{ t("readAccess") }}</h4>
          <p>
            {{ t("selectedAndLinkedMaterialsAndSkillsCanBeLoaded") }}
          </p>
        </div>
      </div>
      <fieldset>
        <legend>
          {{ t("materialLibrary") }}
        </legend>
        <div class="option-grid">
          <label v-for="option in MATERIAL_OPTIONS" :key="option[0]">
            <input
              type="checkbox"
              :checked="checked('material', option[0])"
              :disabled="disabled"
              @change="
                emit(
                  'access',
                  'material',
                  option[0],
                  ($event.target as HTMLInputElement).checked
                )
              "
            />
            <span
              ><strong>{{ option[1] }}</strong
              ><small>{{ option[2] }}</small></span
            >
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>
          {{ t("skillLibrary") }}
        </legend>
        <div class="option-grid">
          <label v-for="option in SKILL_OPTIONS" :key="option[0]">
            <input
              type="checkbox"
              :checked="checked('skill', option[0])"
              :disabled="disabled"
              @change="
                emit(
                  'access',
                  'skill',
                  option[0],
                  ($event.target as HTMLInputElement).checked
                )
              "
            />
            <span
              ><strong>{{ option[1] }}</strong
              ><small>{{ option[2] }}</small></span
            >
          </label>
        </div>
      </fieldset>
    </section>

    <section
      v-if="defaultPlotStages?.length"
      class="profile-card default-stage-card"
    >
      <div class="section-heading">
        <div>
          <h4>
            {{ t("defaultPlotStages") }}
          </h4>
          <p>
            {{ t("choosePlotStagesToCreateAndEnableForThe") }}
          </p>
        </div>
      </div>
      <div class="default-stage-list">
        <label v-for="stage in defaultPlotStages" :key="stage.id">
          <span class="default-stage-copy">
            <strong>{{ stage.title }}</strong>
            <small>{{ stage.description }}</small>
          </span>
          <span class="stage-switch">
            <input
              type="checkbox"
              role="switch"
              :aria-label="
                t('createValueByDefault', {
                  arg0: stage.title
                })
              "
              :checked="stage.enabled"
              :disabled="disabled || stage.locked"
              @change="
                emit(
                  'defaultPlotStage',
                  stage.id,
                  ($event.target as HTMLInputElement).checked
                )
              "
            />
          </span>
        </label>
      </div>
    </section>

    <footer class="profile-actions">
      <button
        type="button"
        class="secondary-button"
        :disabled="disabled"
        @click="emit('reset')"
      >
        {{ t("restoreDefaults") }}
      </button>
      <button
        type="button"
        class="primary-button"
        :disabled="disabled"
        @click="emit('save')"
      >
        {{ saving ? t("saving") : saveLabel }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.profile-editor {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.profile-header span,
.section-heading > span {
  color: var(--text-tertiary);
  font-size: 0.785714rem;
}
.profile-header h3 {
  margin: 4px 0;
  color: var(--text-primary);
  font-size: 1.28571rem;
}
.profile-header p,
.section-heading p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.55;
}
.profile-card {
  border: 1px solid var(--theme-line-soft);
  border-radius: 12px;
  background: var(--surface-raised);
  overflow: hidden;
}
.section-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 17px 12px;
  border-bottom: 1px solid var(--theme-line-soft);
}
.section-heading h4 {
  margin: 0 0 3px;
  font-size: 1rem;
}
textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 260px;
  padding: 16px 17px;
  resize: vertical;
  border: 0;
  outline: none;
  background: var(--surface-main);
  color: var(--text-primary);
  font-family: var(--code-font);
  font-size: var(--code-font-size);
  line-height: 1.65;
}
textarea:focus,
input[type="text"]:focus {
  box-shadow: inset 0 0 0 2px var(--accent-soft);
}
.shortcut-list {
  display: grid;
  gap: 10px;
  padding: 14px 17px 17px;
}
.shortcut-list label {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  color: var(--text-secondary);
}
input[type="text"] {
  box-sizing: border-box;
  width: 100%;
  min-height: 38px;
  padding: 8px 11px;
  border: 1px solid var(--theme-line);
  border-radius: 8px;
  outline: none;
  background: var(--surface-main);
  color: var(--text-primary);
  font: inherit;
}
fieldset {
  margin: 0;
  padding: 14px 17px 17px;
  border: 0;
}
fieldset + fieldset {
  border-top: 1px solid var(--theme-line-soft);
}
legend {
  color: var(--text-secondary);
  font-weight: 620;
}
.option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.option-grid label {
  display: flex;
  gap: 9px;
  padding: 9px 10px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 8px;
}
.option-grid span {
  display: grid;
  gap: 2px;
}
.option-grid strong {
  color: var(--text-primary);
  font-size: 0.892857rem;
}
.option-grid small {
  color: var(--text-tertiary);
  font-size: 0.785714rem;
}
.default-stage-list {
  display: grid;
}
.default-stage-list > label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 13px 17px;
}
.default-stage-list > label + label {
  border-top: 1px solid var(--theme-line-soft);
}
.default-stage-copy {
  display: grid;
  gap: 3px;
}
.default-stage-copy strong {
  color: var(--text-primary);
  font-size: 0.928571rem;
}
.default-stage-copy small {
  color: var(--text-tertiary);
  line-height: 1.45;
}
.stage-switch {
  position: relative;
  flex: 0 0 auto;
  width: 38px;
  height: 22px;
}
.stage-switch input {
  width: 100%;
  height: 100%;
  margin: 0;
  appearance: none;
  border: 1px solid var(--theme-line);
  border-radius: 999px;
  background: var(--surface-muted);
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease;
}
.stage-switch input::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--text-tertiary);
  content: "";
  transition:
    transform 140ms ease,
    background 140ms ease;
}
.stage-switch input:checked {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.stage-switch input:checked::after {
  background: var(--accent);
  transform: translateX(16px);
}
.stage-switch input:focus-visible {
  outline: 2px solid var(--accent-soft);
  outline-offset: 2px;
}
.profile-actions {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
}
.profile-actions button {
  min-height: 34px;
  padding: 7px 13px;
  border-radius: 8px;
  font: inherit;
  cursor: pointer;
}
.secondary-button {
  border: 1px solid var(--theme-line);
  background: var(--surface-raised);
  color: var(--text-primary);
}
.primary-button {
  border: 1px solid var(--neutral-solid);
  background: var(--neutral-solid);
  color: var(--accent-contrast, #fff);
}
button:disabled,
input:disabled,
textarea:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
@media (max-width: 760px) {
  .option-grid {
    grid-template-columns: 1fr;
  }
}
</style>
