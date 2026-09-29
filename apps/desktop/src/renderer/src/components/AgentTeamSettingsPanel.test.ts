import { describe, expect, it } from "vitest";
import componentSource from "./AgentTeamSettingsPanel.vue?raw";
import templateSource from "./AgentTeamSettingsPanel.template.html?raw";
import longComponentSource from "./LongAgentTeamSettingsPanel.vue?raw";
import longTemplateSource from "./LongAgentTeamSettingsPanel.template.html?raw";
import metaSource from "./agentTeamSettingsMeta.ts?raw";

const longSource = `${longComponentSource}\n${longTemplateSource}`;

const source = `${componentSource}\n${templateSource}\n${metaSource}`;

describe("AgentTeamSettingsPanel", () => {
  it("explains the isolated subagent prompt and skill boundary", () => {
    expect(source).toContain("subagentsUseThePrimaryAgentSModelByDefault");
    expect(source).toContain("subagentsUseThePrimaryAgentSModelByDefault");
    expect(source).toContain("loadFromSkillLibrary");
  });

  it("enables short, script and independent long-form teams", () => {
    expect(source).toContain("shortStory");
    expect(source).toContain("screenplay");
    expect(source).toContain("novel");
    expect(source).not.toContain("尚未接入");
    expect(source).toContain("@click=\"activeWorkspaceType = 'script'\"");
    expect(source).toContain(
      ":aria-selected=\"activeWorkspaceType === 'script'\""
    );
    expect(source).toContain("@click=\"activeWorkspaceType = 'long'\"");
    expect(source).toContain(':settings="longSettings"');
    expect(source.match(/role="tab"/g)?.length).toBe(3);
    expect(source).toContain(
      "const activeSkills = computed(() => props.skills ?? [])"
    );
    expect(source).not.toContain(
      "skill.skillType === activeWorkspaceType.value"
    );
  });

  it("maps the unified long parent agent and preserves approval boundaries", () => {
    expect(longSource).toContain("LONG_AGENT_IDS");
    expect(longSource).toContain(
      "parentAgentId: LongAgentId = LONG_AGENT_IDS[0]"
    );
    expect(longSource).not.toContain('id: "setting"');
    expect(longSource).not.toContain("expert_section_writer");
    expect(longSource).toContain(
      "configureSpecialistAssistantsForWorldbuildingCharactersPlotManuscriptAnd"
    );
    expect(source).toContain("subagentsUseThePrimaryAgentSModelByDefault");
    expect(source).toContain("subagentsUseThePrimaryAgentSModelByDefault");
    expect(longSource).toContain("LongAgentTeamSettingsInputSchema.safeParse");
  });

  it("keeps long-form subagent styling and editing features aligned", () => {
    for (const marker of [
      "loadFromSkillLibrary",
      "subagent-summary",
      "subagentModelSummary",
      "editingSubagentId",
      "model-mode-options",
      "doneEditing",
      "primaryAgentSubagentsMessage"
    ]) {
      expect(longSource).toContain(marker);
    }
    expect(longSource).toContain("LoadSubagentFromSkillDialog");
    expect(longSource).toContain(
      '@change="toggleSubagent(definition, $event)"'
    );
    expect(longSource).toContain('@click="duplicateSubagent(index)"');
    expect(longSource).toContain('<AppIcon name="copy" :size="15" />');
    expect(longSource).toContain('@click="removeSubagent(index)"');
    expect(longSource).toContain('@click="saveSettings"');
  });

  it("uses one parent team for short and script workspaces", () => {
    expect(source).toContain('id: "short"');
    expect(source).toContain("shortStoryAgent");
    expect(source).toContain('id: "script"');
    expect(source).toContain("screenplayAgent");
    expect(source).toContain('v-if="visibleParentAgents.length > 1"');
    expect(source).toContain("SCRIPT_PARENT_AGENTS");
    expect(source).toContain("SHORT_PARENT_AGENT");
    expect(source).toContain("activeSubagentLimit");
    expect(source).toContain("SCRIPT_AGENT_SUBAGENT_MAX_COUNT");
    expect(source).not.toContain('label: "人设"');
    expect(source).not.toContain('label: "剧情"');
    expect(source).not.toContain('label: "正文"');
    expect(source).not.toContain('label: "大纲"');
    expect(source).not.toContain('label: "分节"');
    expect(source).toContain("subagentsUseThePrimaryAgentSModelByDefault");
    expect(source).toContain("subagentsUseThePrimaryAgentSModelByDefault");
  });

  it("expands the editor when the single parent navigation is hidden", () => {
    expect(templateSource).toContain(
      `:class="{ 'is-single-column': visibleParentAgents.length === 1 }"`
    );
  });

  it("supports model mode inherit or custom with PopupSelect", () => {
    expect(source).toContain("usePrimaryAgentModel");
    expect(source).toContain("configureModelSeparately");
    expect(source).toContain("setSubagentModelMode(subagent, 'inherit')");
    expect(source).toContain("setSubagentModelMode(subagent, 'custom')");
    expect(source).toContain("PopupSelect");
    expect(source).toContain("models:");
    expect(source).toContain("setSubagentThinkingLevel");
    expect(source).toContain("setSubagentTemperature");
    expect(source).toContain("v-if=\"subagent.thinkingLevel === 'off'\"");
    expect(source.indexOf("t('modelSettings')")).toBeLessThan(
      source.indexOf("t('name')")
    );
  });

  it("supports adding, editing, enabling, copying, deleting and saving subagents", () => {
    expect(source).toContain('@click="addSubagent()"');
    expect(source).toContain('@click="openLoadFromSkill"');
    expect(source).toContain('@click="editSubagent(subagent.id)"');
    expect(source).toContain('@click="duplicateSubagent(index)"');
    expect(source).toContain('<AppIcon name="copy" :size="15" />');
    expect(source).toContain('@change="toggleSubagent(subagent, $event)"');
    expect(source).toContain('@click="removeSubagent(index)"');
    expect(source).toContain('@click="saveSettings"');
    expect(source).toContain("WorkspaceAgentTeamSettingsInputSchema.safeParse");
  });

  it("isolates long loading failures and keeps a successfully loaded sibling editable", () => {
    expect(source).not.toContain("Boolean(props.loadError)");
    expect(source).toContain('v-else-if="loadError && !activeSettings"');
    expect(source).toContain(':loading="longLoading"');
    expect(source).toContain(':saving="longSaving"');
    expect(source).toContain(':load-error="longLoadError ?? null"');
    expect(source).toContain("emit('retry')");
  });
});
