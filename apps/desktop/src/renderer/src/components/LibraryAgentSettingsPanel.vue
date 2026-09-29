<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import {
  LIBRARY_AGENT_MAX_SKILLS,
  type LibraryAgentDomain,
  type LibraryAgentSettings,
  type LibraryAgentSettingsInput,
  type LibraryAgentSkill
} from "@deepwrite/contracts";
import { computed, ref, watch } from "vue";
import { uiMessage } from "../ui-feedback";
import AppIcon from "./AppIcon.vue";

const t = createScopedTranslator("components.libraryAgentSettingsPanel");

type SettingsTabId = "system-prompt" | "available-skills";
type EditableAgent = LibraryAgentSettingsInput["agents"][number];

const props = defineProps<{
  domain: LibraryAgentDomain;
  settings: LibraryAgentSettings | null;
  loading: boolean;
  saving: boolean;
  runtimeAvailable: boolean;
}>();

const emit = defineEmits<{
  save: [settings: LibraryAgentSettingsInput];
  reset: [domain: LibraryAgentDomain];
}>();

const DOMAIN_COPY = {
  skill: {
    get eyebrow() {
      return t("skillLibrary");
    },
    get title() {
      return t("skillLibraryAgent");
    },
    get description() {
      return t("configureTheSkillLibraryAgentSSystemPromptAnd");
    },
    get saveLabel() {
      return t("saveSkillLibrarySettings");
    }
  },
  material: {
    get eyebrow() {
      return t("materialLibrary");
    },
    get title() {
      return t("materialLibraryAgent");
    },
    get description() {
      return t("configureTheMaterialLibraryAgentSSystemPromptAnd");
    },
    get saveLabel() {
      return t("saveMaterialLibrarySettings");
    }
  }
} as const satisfies Record<
  LibraryAgentDomain,
  {
    eyebrow: string;
    title: string;
    description: string;
    saveLabel: string;
  }
>;

const SETTINGS_TABS = [
  {
    id: "system-prompt",
    get label() {
      return t("systemPrompt");
    },
    get description() {
      return t("roleAndWorkflow");
    }
  },
  {
    id: "available-skills",
    get label() {
      return t("availableSkills");
    },
    get description() {
      return t("methodsLoadedOnDemand");
    }
  }
] as const satisfies readonly {
  id: SettingsTabId;
  label: string;
  description: string;
}[];

const activeTabId = ref<SettingsTabId>("system-prompt");
const draftAgents = ref<LibraryAgentSettingsInput["agents"]>([]);
const activeSkillId = ref<string>("");

const activeDraft = computed(() =>
  draftAgents.value.find((agent) => agent.domain === props.domain)
);

const activeProfile = computed(() =>
  props.settings?.agents.find((profile) => profile.domain === props.domain)
);

const activeSkillDraft = computed(() =>
  activeDraft.value?.readAccess.skills.find(
    (skill) => skill.id === activeSkillId.value
  )
);

const domainCopy = computed(() => DOMAIN_COPY[props.domain]);
const formDisabled = computed(
  () => props.loading || props.saving || !props.runtimeAvailable
);

const hasUnsavedChanges = computed(() => {
  const draft = activeDraft.value;
  const saved = activeProfile.value;
  if (!draft || !saved) return false;
  if (draft.systemPrompt !== saved.systemPrompt) return true;
  const savedSkills = saved.readAccess.skills;
  const draftSkills = draft.readAccess.skills;
  if (savedSkills.length !== draftSkills.length) return true;
  return draftSkills.some((skill, index) => {
    const other = savedSkills[index];
    return (
      !other ||
      skill.id !== other.id ||
      skill.name !== other.name ||
      skill.description !== other.description ||
      skill.content !== other.content
    );
  });
});

watch(
  [() => props.settings, () => props.domain],
  () => {
    draftAgents.value = props.settings
      ? props.settings.agents.map((agent) => ({
          domain: agent.domain,
          systemPrompt: agent.systemPrompt,
          readAccess: {
            skills: agent.readAccess.skills.map((skill) => ({ ...skill }))
          }
        }))
      : [];
    activeTabId.value = "system-prompt";
    const skills = activeDraft.value?.readAccess.skills ?? [];
    activeSkillId.value = skills[0]?.id ?? "";
  },
  { immediate: true, deep: true }
);

function selectTab(tabId: SettingsTabId): void {
  activeTabId.value = tabId;
}

function selectSkill(skillId: string): void {
  activeSkillId.value = skillId;
}

function updateSystemPrompt(event: Event): void {
  if (!activeDraft.value || formDisabled.value) return;
  activeDraft.value.systemPrompt = (event.target as HTMLTextAreaElement).value;
}

function updateSkillField(
  field: keyof Pick<LibraryAgentSkill, "name" | "description" | "content">,
  event: Event
): void {
  const skill = activeSkillDraft.value;
  if (!skill || formDisabled.value) return;
  skill[field] = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function createSkillId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

function addSkill(): void {
  const draft = activeDraft.value;
  if (!draft || formDisabled.value) return;
  if (draft.readAccess.skills.length >= LIBRARY_AGENT_MAX_SKILLS) {
    uiMessage.warning(
      t("configureUpToValueSkills", {
        arg0: LIBRARY_AGENT_MAX_SKILLS
      })
    );
    return;
  }
  const skill: LibraryAgentSkill = {
    id: createSkillId("skill"),
    name: t("newSkill"),
    description: "",
    content: t("enterSkillContent")
  };
  draft.readAccess.skills.push(skill);
  activeSkillId.value = skill.id;
}

function removeActiveSkill(): void {
  const draft = activeDraft.value;
  if (!draft || formDisabled.value || !activeSkillDraft.value) return;
  if (draft.readAccess.skills.length <= 1) {
    uiMessage.warning(t("keepAtLeastOneAvailableSkill"));
    return;
  }
  const index = draft.readAccess.skills.findIndex(
    (skill) => skill.id === activeSkillId.value
  );
  if (index < 0) return;
  draft.readAccess.skills.splice(index, 1);
  activeSkillId.value =
    draft.readAccess.skills[Math.max(0, index - 1)]?.id ?? "";
}

function validateSkills(skills: readonly LibraryAgentSkill[]): string | null {
  const names = new Set<string>();
  for (const skill of skills) {
    const name = skill.name.trim();
    const content = skill.content.trim();
    if (!name) return t("everySkillNeedsAName");
    if (!content)
      return t("skillValueNeedsContent", {
        arg0: name || t("untitled")
      });
    if (names.has(name))
      return t("duplicateSkillNameValue", {
        arg0: name
      });
    names.add(name);
  }
  return null;
}

function saveSettings(): void {
  if (formDisabled.value || !props.settings || !activeDraft.value) return;
  if (!activeDraft.value.systemPrompt.trim()) {
    uiMessage.warning(
      t("valueNeedsASystemPrompt", {
        arg0: domainCopy.value.title
      })
    );
    return;
  }
  const skillError = validateSkills(activeDraft.value.readAccess.skills);
  if (skillError) {
    uiMessage.warning(skillError);
    return;
  }

  const agents = props.settings.agents.map((profile) => {
    const draft =
      profile.domain === props.domain
        ? activeDraft.value
        : draftAgents.value.find(
            (candidate) => candidate.domain === profile.domain
          );
    if (!draft) {
      return {
        domain: profile.domain,
        systemPrompt: profile.systemPrompt,
        readAccess: {
          skills: profile.readAccess.skills.map((skill) => ({ ...skill }))
        }
      } satisfies EditableAgent;
    }
    return {
      domain: draft.domain,
      systemPrompt: draft.systemPrompt,
      readAccess: {
        skills: draft.readAccess.skills.map((skill) => ({
          id: skill.id.trim(),
          name: skill.name.trim(),
          description: skill.description.trim(),
          content: skill.content.trim()
        }))
      }
    } satisfies EditableAgent;
  });

  emit("save", { agents });
}

function resetSettings(): void {
  if (formDisabled.value) return;
  emit("reset", props.domain);
}
</script>

<template>
  <section
    class="library-agent-settings"
    :aria-labelledby="`${domain}-library-agent-title`"
  >
    <header class="panel-header">
      <div>
        <span class="panel-kicker">{{ domainCopy.eyebrow }}</span>
        <h2 :id="`${domain}-library-agent-title`">{{ domainCopy.title }}</h2>
        <p>{{ domainCopy.description }}</p>
        <p v-if="!runtimeAvailable" class="runtime-note">
          {{ t("thisEnvironmentSupportsViewingOnlyUseTheDeepWriteDesktop") }}
        </p>
      </div>
      <span
        v-if="hasUnsavedChanges && settings && activeDraft"
        class="prompt-state"
      >
        {{ t("unsaved") }}
      </span>
    </header>

    <div v-if="loading" class="panel-state" aria-live="polite">
      {{
        t("loadingSettingsMessage", {
          arg0: domainCopy.eyebrow ?? ""
        })
      }}
    </div>
    <div v-else-if="!settings || !activeDraft" class="panel-state">
      {{
        t("noAgentSettingsAvailableMessage", { arg0: domainCopy.eyebrow ?? "" })
      }}
    </div>

    <div v-else class="settings-layout">
      <nav
        class="settings-nav"
        :aria-label="
          t('valueSettingsCategory', {
            arg0: domainCopy.eyebrow
          })
        "
      >
        <button
          v-for="tab in SETTINGS_TABS"
          :key="tab.id"
          type="button"
          class="settings-nav-item"
          :class="{ 'is-active': tab.id === activeTabId }"
          :aria-current="tab.id === activeTabId ? 'page' : undefined"
          @click="selectTab(tab.id)"
        >
          <strong>{{ tab.label }}</strong>
          <small>{{ tab.description }}</small>
        </button>
      </nav>

      <div class="settings-editor">
        <section
          v-if="activeTabId === 'system-prompt'"
          class="settings-card prompt-card"
        >
          <div class="section-heading">
            <div>
              <h4>
                {{ t("systemPrompt") }}
              </h4>
              <p>
                {{ t("theCurrentLibraryActiveEntryReadOnlyStatusAnd") }}
              </p>
            </div>
            <span>{{
              t("charactersMessage", {
                arg0: activeDraft.systemPrompt.length ?? ""
              })
            }}</span>
          </div>
          <textarea
            :value="activeDraft.systemPrompt"
            :disabled="formDisabled"
            spellcheck="false"
            :aria-label="
              t('valueSystemPrompt', {
                arg0: domainCopy.title
              })
            "
            :placeholder="t('enterTheLibraryAgentSSystemPrompt')"
            @input="updateSystemPrompt"
          />
        </section>

        <section
          v-else
          class="settings-card skills-card"
          :aria-label="t('availableSkillSettings')"
        >
          <div class="section-heading">
            <div>
              <h4>
                {{ t("availableSkills") }}
              </h4>
              <p>
                {{
                  t("configureMethodSkillsIndividuallyTheAgentLoadsContentBy")
                }}
              </p>
            </div>
            <button
              type="button"
              class="inline-action"
              :disabled="formDisabled"
              @click="addSkill"
            >
              <AppIcon name="plus" :size="14" />
              {{ t("addSkill") }}
            </button>
          </div>

          <div v-if="!activeSkillDraft" class="skills-empty">
            {{ t("noSkillsAvailableAddAtLeastOne") }}
          </div>
          <div v-else class="skills-layout">
            <nav class="skill-nav" :aria-label="t('skillList')">
              <button
                v-for="skill in activeDraft.readAccess.skills"
                :key="skill.id"
                type="button"
                class="skill-nav-item"
                :class="{ 'is-active': skill.id === activeSkillId }"
                :aria-current="skill.id === activeSkillId ? 'page' : undefined"
                @click="selectSkill(skill.id)"
              >
                <strong>{{ skill.name.trim() || t("untitledSkill") }}</strong>
                <small>{{
                  skill.description.trim() || t("noDescription")
                }}</small>
              </button>
            </nav>

            <div class="skill-editor">
              <label class="field">
                <span>{{ t("skillName") }}</span>
                <input
                  :value="activeSkillDraft.name"
                  :disabled="formDisabled"
                  maxlength="120"
                  :placeholder="t('forExampleCreateASkill')"
                  @input="updateSkillField('name', $event)"
                />
              </label>
              <label class="field">
                <span>{{ t("skillDescription") }}</span>
                <input
                  :value="activeSkillDraft.description"
                  :disabled="formDisabled"
                  maxlength="500"
                  :placeholder="t('brieflyDescribeWhatThisMethodDoes')"
                  @input="updateSkillField('description', $event)"
                />
              </label>
              <label class="field field-content">
                <span>{{ t("skillContent") }}</span>
                <textarea
                  :value="activeSkillDraft.content"
                  :disabled="formDisabled"
                  spellcheck="false"
                  :placeholder="t('enterTheMethodContentLoadedByLoadSkill')"
                  @input="updateSkillField('content', $event)"
                />
              </label>
              <div class="skill-editor-actions">
                <button
                  type="button"
                  class="danger-button"
                  :disabled="
                    formDisabled || activeDraft.readAccess.skills.length <= 1
                  "
                  @click="removeActiveSkill"
                >
                  {{ t("deleteCurrentSkill") }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <footer class="panel-actions">
          <button
            type="button"
            class="secondary-button"
            :disabled="formDisabled"
            @click="resetSettings"
          >
            <AppIcon name="history" :size="15" />
            {{ t("restoreDefaults") }}
          </button>
          <button
            type="button"
            class="primary-button"
            :disabled="formDisabled"
            @click="saveSettings"
          >
            <AppIcon name="save" :size="15" />
            {{ saving ? t("saving") : domainCopy.saveLabel }}
          </button>
        </footer>
      </div>
    </div>
  </section>
</template>

<style scoped>
.library-agent-settings {
  width: min(100%, 980px);
  color: var(--text-primary);
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}

.panel-kicker {
  color: var(--text-tertiary);
  font-size: 0.785714rem;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.panel-header h2 {
  margin: 4px 0 5px;
  font-size: 1.57143rem;
  font-weight: 650;
}

.panel-header p,
.section-heading p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.892857rem;
  line-height: 1.55;
}

.runtime-note {
  margin-top: 5px !important;
  color: var(--warning-text, #8a6731) !important;
}

.panel-state {
  padding: 48px 20px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 12px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  text-align: center;
}

.settings-layout {
  display: grid;
  grid-template-columns: 174px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.settings-nav {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 11px;
  background: var(--surface-muted);
}

.settings-nav-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 50px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
}

.settings-nav-item:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.settings-nav-item.is-active {
  background: var(--surface-raised);
  color: var(--text-primary);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}

.settings-nav-item small {
  color: var(--text-tertiary);
  font-size: 0.75rem;
}

.settings-nav-item strong {
  font-size: 0.964286rem;
  font-weight: 590;
}

.settings-editor {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.prompt-state {
  flex: none;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--surface-selected);
  color: var(--text-secondary);
  font-size: 0.785714rem;
  font-weight: 620;
}

.settings-card {
  overflow: hidden;
  border: 1px solid var(--theme-line-soft);
  border-radius: 13px;
  background: var(--surface-raised);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.035);
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 15px 17px 12px;
  border-bottom: 1px solid var(--theme-line-soft);
}

.section-heading h4 {
  margin: 0 0 3px;
  font-size: 1rem;
  font-weight: 620;
}

.section-heading > span {
  flex: none;
  color: var(--text-tertiary);
  font-size: 0.821429rem;
}

.inline-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--theme-line);
  border-radius: 8px;
  background: var(--surface-main);
  color: var(--text-primary);
  font-size: 0.857143rem;
  font-weight: 560;
  cursor: pointer;
}

.inline-action:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.prompt-card textarea {
  display: block;
  width: 100%;
  min-height: 360px;
  padding: 16px 17px;
  resize: vertical;
  border: 0;
  outline: none;
  box-sizing: border-box;
  background: var(--surface-main);
  color: var(--text-primary);
  font-family: var(--code-font);
  font-size: var(--code-font-size);
  line-height: 1.65;
}

.prompt-card textarea:focus {
  box-shadow: inset 0 0 0 2px var(--accent-soft);
}

.prompt-card textarea:disabled {
  color: var(--text-tertiary);
  cursor: not-allowed;
}

.skills-empty {
  padding: 28px 17px;
  color: var(--text-secondary);
  text-align: center;
}

.skills-layout {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 0;
}

.skill-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border-right: 1px solid var(--theme-line-soft);
  background: var(--surface-muted);
}

.skill-nav-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 48px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
}

.skill-nav-item:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.skill-nav-item.is-active {
  background: var(--surface-raised);
  color: var(--text-primary);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}

.skill-nav-item strong {
  font-size: 0.892857rem;
  font-weight: 590;
}

.skill-nav-item small {
  color: var(--text-tertiary);
  font-size: 0.75rem;
  line-height: 1.35;
}

.skill-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 17px 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field > span {
  color: var(--text-secondary);
  font-size: 0.821429rem;
  font-weight: 620;
}

.field input,
.field textarea {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 8px;
  background: var(--surface-main);
  color: var(--text-primary);
  font-size: 0.892857rem;
  line-height: 1.5;
  box-sizing: border-box;
}

.field textarea {
  min-height: 220px;
  resize: vertical;
  font-family: var(--code-font);
  font-size: var(--code-font-size);
  line-height: 1.65;
}

.field input:focus,
.field textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.field input:disabled,
.field textarea:disabled {
  color: var(--text-tertiary);
  cursor: not-allowed;
}

.skill-editor-actions {
  display: flex;
  justify-content: flex-end;
}

.danger-button {
  min-height: 32px;
  padding: 6px 11px;
  border: 1px solid
    color-mix(in srgb, var(--danger, #c44) 35%, var(--theme-line));
  border-radius: 8px;
  background: color-mix(in srgb, var(--danger, #c44) 8%, var(--surface-main));
  color: var(--danger, #a33);
  font-size: 0.857143rem;
  font-weight: 560;
  cursor: pointer;
}

.danger-button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  padding-top: 2px;
}

.panel-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 7px 13px;
  border-radius: 8px;
  font-size: 0.892857rem;
  font-weight: 570;
  cursor: pointer;
}

.secondary-button {
  border: 1px solid var(--theme-line);
  background: var(--surface-raised);
  color: var(--text-primary);
}

.primary-button {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
}

.panel-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

@media (max-width: 760px) {
  .settings-layout,
  .skills-layout {
    grid-template-columns: 1fr;
  }

  .settings-nav {
    position: static;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .skill-nav {
    border-right: 0;
    border-bottom: 1px solid var(--theme-line-soft);
  }

  .panel-actions {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .panel-actions button {
    justify-content: center;
  }
}
</style>
