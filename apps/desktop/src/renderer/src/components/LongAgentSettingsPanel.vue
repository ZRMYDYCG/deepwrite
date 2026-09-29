<script setup lang="ts">
import {
  builtinAgentLabel,
  builtinAgentDescription
} from "../i18n/builtinLabels";
import { createScopedTranslator } from "../i18n";
import {
  DEFAULT_LONG_AGENT_SETTINGS,
  LONG_AGENT_IDS,
  LongAgentSettingsInputSchema,
  getDefaultLongAgentProfile,
  type LongAgentId,
  type LongAgentSettings,
  type LongAgentSettingsInput,
  type LongAgentSettingsInputAgent,
  type LongWorkspaceRoot,
  type MaterialKind,
  type SkillKind
} from "@deepwrite/contracts";
import { computed, ref, watch } from "vue";
import { uiMessage } from "../ui-feedback";

const t = createScopedTranslator("components.longAgentSettingsPanel");

interface ReadOption<T extends string> {
  id: T;
  label: string;
  description: string;
}

const props = defineProps<{
  settings: LongAgentSettings | null;
  loading: boolean;
  saving: boolean;
  loadError?: string | null;
  runtimeAvailable: boolean;
}>();

const emit = defineEmits<{
  retry: [];
  save: [settings: LongAgentSettingsInput];
}>();

const WORKSPACE_OPTIONS = [
  {
    id: "worldbuilding",
    get label() {
      return t("worldbuilding");
    },
    get description() {
      return t("rulesFactionsGeographyHistoryTerminologyRanksAndItems");
    }
  },
  {
    id: "character_design",
    get label() {
      return t("characterDesign");
    },
    get description() {
      return t("coreProfilesRelationshipsCurrentStateAndHistory");
    }
  },
  {
    id: "plot_design",
    get label() {
      return t("plotStructure");
    },
    get description() {
      return t("volumesArcsChapterCardsEventsBeatsAndForeshadowing");
    }
  },
  {
    id: "draft",
    get label() {
      return t("manuscript");
    },
    get description() {
      return t("chapterManuscriptsCharacterStateAndNextChapterHandoff");
    }
  },
  {
    id: "continuity_ledger",
    get label() {
      return t("continuityLedger");
    },
    get description() {
      return t("committedFactsSummariesDecisionsAndAuditRecords");
    }
  }
] as const satisfies readonly ReadOption<LongWorkspaceRoot>[];

const MATERIAL_OPTIONS = [
  {
    id: "character",
    get label() {
      return t("characterMaterials");
    },
    get description() {
      return t("characterDesignReferences");
    }
  },
  {
    id: "gimmick",
    get label() {
      return t("hookMaterials");
    },
    get description() {
      return t("genreHooksAndCreativeIdeas");
    }
  },
  {
    id: "plot",
    get label() {
      return t("plotMaterials");
    },
    get description() {
      return t("plotStructuresAndSceneReferences");
    }
  },
  {
    id: "draft",
    get label() {
      return t("manuscriptMaterials");
    },
    get description() {
      return t("manuscriptExcerptsAndProseReferences");
    }
  },
  {
    id: "other",
    get label() {
      return t("otherMaterials");
    },
    get description() {
      return t("materialsOutsideTheCategoriesAbove");
    }
  }
] as const satisfies readonly ReadOption<MaterialKind>[];

const SKILL_OPTIONS = [
  {
    id: "general",
    get label() {
      return t("generalSkills");
    },
    get description() {
      return t("reusableCapabilitiesAcrossStages");
    }
  },
  {
    id: "plot",
    get label() {
      return t("plotSkills");
    },
    get description() {
      return t("worldbuildingPlotAndStructuralDesign");
    }
  },
  {
    id: "style",
    get label() {
      return t("styleSkills");
    },
    get description() {
      return t("proseAndWritingStyleExecution");
    }
  },
  {
    id: "other",
    get label() {
      return t("otherSkills");
    },
    get description() {
      return t("skillsOutsideTheCategoriesAbove");
    }
  }
] as const satisfies readonly ReadOption<SkillKind>[];

const agentId: LongAgentId = LONG_AGENT_IDS[0];
const draftAgents = ref<LongAgentSettingsInput["agents"]>([]);

const activeAgent = computed(() =>
  draftAgents.value.find((agent) => agent.id === agentId)
);
const activeProfile = computed(() =>
  props.settings?.agents.find((agent) => agent.id === agentId)
);
const immutableProfile = computed(() => getDefaultLongAgentProfile(agentId));
const formDisabled = computed(
  () =>
    props.loading ||
    props.saving ||
    Boolean(props.loadError) ||
    !props.runtimeAvailable
);
const hasCompleteDraft = computed(() =>
  LONG_AGENT_IDS.every((id) =>
    draftAgents.value.some((agent) => agent.id === id)
  )
);

watch(
  () => props.settings,
  (settings) => {
    draftAgents.value = settings
      ? settings.agents.map((agent) => ({
          id: agent.id,
          systemPrompt: agent.systemPrompt,
          welcomeShortcuts: [
            agent.welcomeShortcuts[0],
            agent.welcomeShortcuts[1],
            agent.welcomeShortcuts[2]
          ],
          readAccess: {
            workspaceRoots: [...agent.readAccess.workspaceRoots],
            materialKinds: [...agent.readAccess.materialKinds],
            skillKinds: [...agent.readAccess.skillKinds]
          }
        }))
      : [];
  },
  { immediate: true, deep: true }
);

function isReadAccessChecked(
  scope: "materialKinds" | "skillKinds",
  id: string
): boolean {
  const values = activeAgent.value?.readAccess[scope] as
    readonly string[] | undefined;
  return values?.includes(id) ?? false;
}

function handleCheckboxChange(
  scope: "materialKinds" | "skillKinds",
  id: string,
  event: Event
): void {
  const agent = activeAgent.value;
  if (!agent || formDisabled.value) return;
  const values = new Set(agent.readAccess[scope] as readonly string[]);
  if ((event.target as HTMLInputElement).checked) values.add(id);
  else values.delete(id);
  Object.assign(agent.readAccess, { [scope]: [...values] });
}

function resetActiveAgent(): void {
  if (formDisabled.value) return;
  const builtin = DEFAULT_LONG_AGENT_SETTINGS.agents.find(
    (agent) => agent.id === agentId
  );
  const index = draftAgents.value.findIndex((agent) => agent.id === agentId);
  if (!builtin || index < 0) return;
  draftAgents.value[index] = {
    id: builtin.id,
    systemPrompt: builtin.systemPrompt,
    welcomeShortcuts: [
      builtin.welcomeShortcuts[0],
      builtin.welcomeShortcuts[1],
      builtin.welcomeShortcuts[2]
    ],
    readAccess: {
      workspaceRoots: [...builtin.readAccess.workspaceRoots],
      materialKinds: [...builtin.readAccess.materialKinds],
      skillKinds: [...builtin.readAccess.skillKinds]
    }
  };
  uiMessage.info(t("theNovelAgentHasBeenResetToBuiltIn"));
}

function saveSettings(): void {
  if (formDisabled.value || !hasCompleteDraft.value) return;
  const agents = LONG_AGENT_IDS.map((id) => {
    const agent = draftAgents.value.find((candidate) => candidate.id === id);
    if (!agent) return null;
    return {
      id,
      systemPrompt: agent.systemPrompt,
      welcomeShortcuts: agent.welcomeShortcuts,
      readAccess: {
        workspaceRoots: [
          ...getDefaultLongAgentProfile(id).readAccess.workspaceRoots
        ],
        materialKinds: [...agent.readAccess.materialKinds],
        skillKinds: [...agent.readAccess.skillKinds]
      }
    };
  }).filter((agent): agent is LongAgentSettingsInputAgent => agent !== null);
  if (agents.length !== LONG_AGENT_IDS.length) return;
  const parsed = LongAgentSettingsInputSchema.safeParse({
    workspaceType: "long",
    agents
  });
  if (!parsed.success) {
    uiMessage.warning(t("novelAgentSettingsAreIncomplete"));
    return;
  }
  emit("save", parsed.data);
}
</script>

<template>
  <div v-if="loading" class="panel-state" aria-live="polite">
    {{ t("loadingNovelAgentSettings") }}
  </div>
  <div v-else-if="loadError" class="panel-state" role="alert">
    <strong>{{ t("novelAgentSettingsHaveNotLoaded") }}</strong>
    <p>{{ loadError }}</p>
    <button
      type="button"
      class="secondary-button"
      :disabled="loading"
      @click="emit('retry')"
    >
      {{ t("reload") }}
    </button>
  </div>
  <div v-else-if="!settings || !activeAgent" class="panel-state">
    {{ t("noNovelAgentSettingsAvailable") }}
  </div>
  <div v-else class="long-agent-settings-layout">
    <div class="agent-editor">
      <header class="agent-header">
        <span>{{ t("novel") }}</span>
        <h3>
          {{ builtinAgentLabel("long", activeProfile?.label) }}
        </h3>
        <p>{{ builtinAgentDescription("long", activeProfile?.description) }}</p>
      </header>

      <section class="settings-card prompt-card">
        <div class="section-heading">
          <div>
            <h4>{{ t("systemPrompt") }}</h4>
            <p>
              {{ t("theWorkCurrentLocationAndAuthorizedNovelToolsAre") }}
            </p>
          </div>
          <span>{{
            t("charactersMessage", {
              arg0: activeAgent.systemPrompt.length ?? ""
            })
          }}</span>
        </div>
        <textarea
          v-model="activeAgent.systemPrompt"
          :disabled="formDisabled"
          spellcheck="false"
          :aria-label="t('novelAgentSystemPrompt')"
          :placeholder="t('enterTheNovelAgentSSystemPrompt')"
        />
      </section>

      <section class="settings-card">
        <div class="section-heading">
          <div>
            <h4>{{ t("readAccess") }}</h4>
            <p>
              {{ t("configureWhichMaterialAndSkillCategoriesThisAgentMay") }}
            </p>
          </div>
        </div>

        <fieldset>
          <legend>
            {{ t("materialLibrary") }}
          </legend>
          <div class="option-grid">
            <label
              v-for="option in MATERIAL_OPTIONS"
              :key="option.id"
              class="read-option"
            >
              <input
                type="checkbox"
                :checked="isReadAccessChecked('materialKinds', option.id)"
                :disabled="formDisabled"
                @change="
                  handleCheckboxChange('materialKinds', option.id, $event)
                "
              />
              <span>
                <strong>{{ option.label }}</strong>
                <small>{{ option.description }}</small>
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>
            {{ t("skillLibrary") }}
          </legend>
          <div class="option-grid">
            <label
              v-for="option in SKILL_OPTIONS"
              :key="option.id"
              class="read-option"
            >
              <input
                type="checkbox"
                :checked="isReadAccessChecked('skillKinds', option.id)"
                :disabled="formDisabled"
                @change="handleCheckboxChange('skillKinds', option.id, $event)"
              />
              <span>
                <strong>{{ option.label }}</strong>
                <small>{{ option.description }}</small>
              </span>
            </label>
          </div>
        </fieldset>
      </section>

      <section class="settings-card immutable-card">
        <div class="section-heading">
          <div>
            <h4>
              {{ t("stageAccessAndToolBoundaries") }}
            </h4>
            <p>
              {{ t("stageAccessAndWriteBoundariesAreBuiltIntoThe") }}
            </p>
          </div>
          <span>{{ t("fixed") }}</span>
        </div>
        <p class="immutable-label">
          {{
            t(
              "readableStagesAllWorldbuildingCharactersPlotManuscriptAndContinuity"
            )
          }}
        </p>
        <div class="immutable-list">
          <span v-for="option in WORKSPACE_OPTIONS" :key="`read:${option.id}`">
            {{ option.label }}
          </span>
        </div>
        <p class="immutable-label">
          {{ t("writeAccessAndAvailableTools") }}
        </p>
        <div class="immutable-list">
          <span
            v-for="root in immutableProfile.writeAccess.workspaceRoots"
            :key="`root:${root}`"
          >
            {{
              WORKSPACE_OPTIONS.find((option) => option.id === root)?.label ??
              root
            }}
          </span>
          <span
            v-for="capability in immutableProfile.writeAccess.capabilities"
            :key="`capability:${capability}`"
          >
            {{ capability }}
          </span>
        </div>
      </section>

      <footer class="panel-actions">
        <button
          type="button"
          class="secondary-button"
          :disabled="formDisabled"
          @click="resetActiveAgent"
        >
          {{ t("restoreDefaults") }}
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="formDisabled || !hasCompleteDraft"
          @click="saveSettings"
        >
          {{ saving ? t("saving") : t("saveNovelAgentSettings") }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.panel-state {
  padding: 28px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 12px;
  background: var(--surface-raised);
  color: var(--text-secondary);
}

.long-agent-settings-layout {
  display: grid;
  gap: 18px;
  align-items: start;
}

.agent-editor {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.agent-header span,
.section-heading span {
  color: var(--text-tertiary);
  font-size: 12px;
}

.agent-header h3 {
  margin: 4px 0;
  color: var(--text-primary);
  font-size: 20px;
}

.agent-header p,
.section-heading p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.55;
}

.settings-card {
  padding: 16px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 12px;
  background: var(--surface-raised);
}

.section-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.section-heading h4 {
  margin: 0 0 4px;
  color: var(--text-primary);
  font-size: 15px;
}

textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--theme-line);
  border-radius: 9px;
  outline: none;
  background: var(--surface-main);
  color: var(--text-primary);
  font: inherit;
}

textarea {
  min-height: 230px;
  padding: 12px;
  resize: vertical;
  line-height: 1.55;
}

textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

fieldset {
  margin: 14px 0 0;
  padding: 0;
  border: 0;
}

legend {
  margin-bottom: 8px;
  color: var(--text-primary);
  font-weight: 600;
}

.option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.read-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 9px;
  align-items: start;
  padding: 10px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 9px;
  background: var(--surface-main);
}

.read-option span,
.read-option strong,
.read-option small {
  display: block;
}

.read-option strong {
  color: var(--text-primary);
}

.read-option small {
  margin-top: 3px;
  color: var(--text-tertiary);
  line-height: 1.4;
}

.immutable-label {
  margin: 10px 0 8px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.immutable-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.immutable-list span {
  padding: 5px 9px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: 12px;
}

.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.secondary-button,
.primary-button {
  min-height: 38px;
  padding: 8px 14px;
  border-radius: 9px;
  font: inherit;
  cursor: pointer;
}

.secondary-button {
  border: 1px solid var(--theme-line);
  background: var(--surface-raised);
  color: var(--text-primary);
}

.primary-button {
  border: 1px solid var(--text-primary);
  background: var(--text-primary);
  color: var(--surface-main);
}

button:disabled,
textarea:disabled,
input:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

@media (max-width: 760px) {
  .option-grid {
    grid-template-columns: 1fr;
  }
}
</style>
