import { describe, expect, it } from "vitest";
import longPanelSource from "./LongAgentSettingsPanel.vue?raw";
import workspacePanelSource from "./ShortAgentSettingsPanel.vue?raw";
import shortPanelSource from "./UnifiedShortAgentSettingsPanel.vue?raw";
import scriptPanelSource from "./ScriptAgentSettingsPanel.vue?raw";
import profileFormSource from "./WorkspaceAgentProfileForm.vue?raw";
import settingsPageSource from "./SettingsPage.vue?raw";

describe("long agent settings UI", () => {
  it("renders one unified profile for short and script workspaces", () => {
    expect(shortPanelSource).toContain("settings?.agents[0]");
    expect(shortPanelSource).toContain('workspaceType: "short"');
    expect(shortPanelSource).not.toContain("SCRIPT_WORKSPACE_AGENT_IDS");
    expect(shortPanelSource).not.toContain("agent-nav");
    expect(scriptPanelSource).toContain("settings?.agents[0]");
    expect(scriptPanelSource).toContain('workspaceType: "script"');
    expect(scriptPanelSource).not.toContain("SCRIPT_WORKSPACE_AGENT_IDS");
    expect(scriptPanelSource).not.toContain("agent-nav");
  });

  it("exposes a single unified long-form agent in the creation settings page", () => {
    expect(longPanelSource).toContain("LONG_AGENT_IDS");
    expect(longPanelSource).toContain('id: "worldbuilding"');
    expect(longPanelSource).toContain('id: "character_design"');
    expect(longPanelSource).toContain('id: "plot_design"');
    expect(longPanelSource).toContain('id: "draft"');
    expect(longPanelSource).toContain('id: "continuity_ledger"');
    expect(longPanelSource).not.toContain('id: "setting"');
    expect(longPanelSource).not.toContain("expert_section_writer");
    expect(longPanelSource).toContain("theNovelAgentHasBeenResetToBuiltIn");
    expect(workspacePanelSource).toContain('@click="activeType = type"');
    expect(workspacePanelSource).not.toContain("长篇 <small>尚未接入</small>");
    expect(settingsPageSource).toContain(
      "@save-long=\"emit('saveLongAgents', $event)\""
    );
  });

  it("edits prompts and catalog read scopes without obsolete welcome controls", () => {
    expect(longPanelSource).toContain("LongAgentSettingsInputSchema.safeParse");
    expect(longPanelSource).toContain("readAccess.materialKinds");
    expect(longPanelSource).toContain("readAccess.skillKinds");
    expect(longPanelSource).toContain("systemPrompt");
    expect(longPanelSource).toContain("welcomeShortcuts");
    expect(longPanelSource).not.toContain("welcome-shortcut-list");
    expect(longPanelSource).not.toContain(
      "threeQuickPromptsShownWhenAConversationIsEmpty"
    );
    expect(longPanelSource).toContain("materialLibrary");
    expect(longPanelSource).toContain("skillLibrary");
    expect(longPanelSource).not.toContain('v-model="activeAgent.writeAccess');
    expect(longPanelSource).not.toContain("patchWriteAccess");
  });

  it("shows fixed full read access and immutable write boundaries", () => {
    expect(longPanelSource).not.toContain("isRequiredWorkspaceRoot");
    expect(longPanelSource).toContain("stageAccessAndToolBoundaries");
    expect(longPanelSource).toContain(
      "stageAccessAndWriteBoundariesAreBuiltIntoThe"
    );
    expect(longPanelSource).toContain(
      "readableStagesAllWorldbuildingCharactersPlotManuscriptAndContinuity"
    );
  });

  it("removes stage read controls from short, script and long settings", () => {
    expect(profileFormSource).not.toContain("<legend>创作空间</legend>");
    expect(profileFormSource).not.toContain("REQUIRED_WORKSPACE_STAGES");
    expect(profileFormSource).not.toContain("readAccess.workspace");
    expect(shortPanelSource).not.toContain("STAGE_POLICY");
    expect(shortPanelSource).not.toContain("人物：人物素材");
    expect(scriptPanelSource).not.toContain("STAGE_POLICY");
    expect(scriptPanelSource).not.toContain("人物：人物素材");
    expect(longPanelSource).not.toContain("<legend>长篇工作区</legend>");
    expect(longPanelSource).not.toContain(
      "handleCheckboxChange('workspaceRoots'"
    );
  });

  it("uses global theme surfaces and remains responsive in narrow windows", () => {
    expect(longPanelSource).toContain("var(--surface-raised)");
    expect(longPanelSource).toContain("var(--theme-line-soft)");
    expect(longPanelSource).toContain("var(--text-primary)");
    expect(longPanelSource).toContain(
      'v-else class="long-agent-settings-layout"'
    );
    expect(longPanelSource).not.toContain('v-else class="settings-layout"');
    expect(longPanelSource).toContain("@media (max-width: 760px)");
    expect(longPanelSource).not.toContain("<select");
  });

  it("uses loading, saving and feedback state isolated from short and script", () => {
    expect(workspacePanelSource).toContain("longLoading: boolean");
    expect(workspacePanelSource).toContain("longSaving: boolean");
    expect(workspacePanelSource).toContain("longErrorMessage: string | null");
    expect(shortPanelSource).toContain(
      'import { uiMessage } from "../ui-feedback"'
    );
    expect(workspacePanelSource).not.toContain("toast-stack");
    expect(workspacePanelSource).not.toContain("settings-toast");
    expect(workspacePanelSource).not.toContain("statusMessage");
    expect(workspacePanelSource).not.toContain("errorMessage: string | null");
    expect(workspacePanelSource).toContain(':loading="longLoading"');
    expect(workspacePanelSource).toContain(':saving="longSaving"');
    expect(settingsPageSource).toContain(':long-loading="longAgentLoading"');
    expect(settingsPageSource).toContain(':long-saving="longAgentSaving"');
    expect(settingsPageSource).not.toContain("workspaceAgentStatus");
    expect(settingsPageSource).not.toContain("longAgentStatus");
    expect(longPanelSource).toContain("loadError?: string | null");
    expect(longPanelSource).toContain('v-else-if="loadError"');
    expect(longPanelSource).toContain("@click=\"emit('retry')\"");
    expect(workspacePanelSource).toContain("@retry=\"emit('retryLong')\"");
    expect(settingsPageSource).toContain(
      "@retry-long=\"emit('retryLongAgents')\""
    );
  });
});
