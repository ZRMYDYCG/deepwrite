import { describe, expect, it } from "vitest";
import deleteDialogSource from "./LongStructureDeleteDialog.vue?raw";
import source from "./LongStructureManager.vue?raw";
import syncDialogSource from "./LongWorldbuildingSyncDialog.vue?raw";
import deleteConfirmationSource from "../composables/useLongStructureDeleteConfirmation.ts?raw";

describe("LongStructureManager", () => {
  it("manages worldbuilding categories and text-only character types", () => {
    expect(source).toContain("manageStructure");
    expect(source).toContain(
      "manageWorldbuildingCategoriesCharacterTypesFeaturesAndNovelContext"
    );
    expect(source).toContain("props.snapshot.worldbuilding");
    expect(source).toContain("builder.createWorldbuilding");
    expect(source).toContain("builder.updateWorldbuilding");
    expect(source).toContain("builder.reorderWorldbuilding");
    expect(deleteConfirmationSource).toContain("builder.deleteWorldbuilding");
    expect(source).toContain("newWorldbuildingCategory");
    expect(source).toContain("loadWorldbuildingFromAnotherBook");
    expect(syncDialogSource).toContain("loadWorldbuildingFromAnotherBook");
    expect(syncDialogSource).toContain(
      "readAllContentFromTheWorldbuildingCategoriesMessage"
    );
    expect(source).toContain('"syncWorldbuilding"');
    expect(source).not.toContain("builder.createVolume");
    expect(source).not.toContain("builder.createArc");
    expect(source).not.toContain("builder.createChapter");
    expect(source).toContain("builder.createCharacterType");
    expect(source).toContain("builder.updateCharacterType");
    expect(source).toContain("builder.reorderCharacterType");
    expect(deleteConfirmationSource).toContain("builder.deleteCharacterType");
    expect(source).toContain("characterType");
    expect(deleteDialogSource).toContain("moveCharactersAndDelete");
    expect(deleteDialogSource).toContain("deleteTypeAndItsCharacters");
    expect(source).toContain("activeFoundationSection === 'worldbuilding'");
    expect(source).not.toContain("builder.updateVolume");
    expect(source).not.toContain("builder.updateArc");
    expect(source).not.toContain("builder.updateChapter");
    expect(source).not.toContain("builder.deleteVolume");
    expect(source).not.toContain("builder.deleteArc");
    expect(source).not.toContain("builder.deleteChapter");
  });

  it("replaces narrative management with worldbuilding feature settings", () => {
    expect(source).toContain(
      'type StructurePanel = "foundation" | "features" | "agents"'
    );
    expect(source).toContain("basicStructure");
    expect(source).toContain("featureSettings");
    expect(source).toContain("novelContext");
    expect(source.indexOf("novelContext")).toBeLessThan(
      source.indexOf("basicStructure")
    );
    expect(source.indexOf("basicStructure")).toBeLessThan(
      source.indexOf("featureSettings")
    );
    expect(source).toContain(
      "grid-template-columns: repeat(3, minmax(0, 1fr))"
    );
    expect(source).not.toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr))"
    );
    expect(source).toContain("worldbuildingEntryLayout");
    expect(source).toContain("characterAndContinuityLayout");
    expect(source).toContain("plotDesignEntryLayout");
    expect(source).toContain('value: "top-tabs"');
    expect(source).toContain('value: "right-list"');
    expect(source).toContain('value: "left-tree"');
    expect(source).toContain("treeOnTheLeft");
    expect(source).toContain("builder.updateFeatureSettings");
    expect(source).toContain(
      "snapshot.featureSettings.worldbuildingItemLayout"
    );
    expect(source).toContain(
      "snapshot.featureSettings.characterAndContinuityItemLayout"
    );
    expect(source).toContain("snapshot.featureSettings.plotItemLayout");
    expect(source).toContain("<PopupSelect");
    expect(source).not.toContain('label: "剧情与叙事"');
    expect(source).not.toContain("<LongPlotStructureManager");
    expect(source).not.toContain('label: "人物"');
    expect(source).not.toContain('label: "分卷"');
    expect(source).not.toContain('label: "剧情点"');
    expect(source).not.toContain('label: "章卡"');
    expect(source).not.toContain("功能配置项暂时为空");
    expect(source).toContain('id="long-structure-panel-content-agents"');
    expect(source).toContain("novelContext");
    expect(source).toContain('"saveAgentsMd"');
    expect(source).toContain("flushAgentsMdIfNeeded");
  });

  it("waits for durable completion and preserves form drafts on failure", () => {
    expect(source).toContain("const pendingMutation = ref<");
    expect(source).toContain(
      "() => props.disabled || pendingMutation.value !== null"
    );
    expect(source).toContain(
      'succeed: () => finishMutation(requestId, "succeeded")'
    );
    expect(source).toContain('fail: () => finishMutation(requestId, "failed")');
    expect(source).toContain("appliedButRefreshFailed");
    expect(source).toContain('if (outcome === "failed") return');
    expect(source).toContain('}, "form")');
    expect(source).toContain('"delete"');
    expect(source).toContain(':disabled="mutationLocked"');
  });

  it("uses shared themed controls and compact teleported dialogs", () => {
    expect(source).toContain("<PopupSelect");
    expect(source.match(/<Teleport to="body">/gu)).toHaveLength(1);
    expect(deleteDialogSource.match(/<Teleport to="body">/gu)).toHaveLength(1);
    expect(syncDialogSource.match(/<Teleport to="body">/gu)).toHaveLength(1);
    expect(source).toContain(':menu-z-index="2300"');
    for (const themeToken of [
      "--surface-main",
      "--surface-raised",
      "--surface-muted",
      "--surface-hover",
      "--theme-line",
      "--theme-line-soft",
      "--text-primary",
      "--text-secondary",
      "--text-tertiary",
      "--accent",
      "--accent-soft",
      "--neutral-solid"
    ]) {
      expect(source).toContain(`var(${themeToken})`);
    }
    expect(source).toContain("font-size: 0.875rem");
    expect(source).toContain("@media (max-width: 42rem)");
    expect(source).toContain("uiMessage.warning");
    expect(source).toContain('@keydown.esc.stop="closeForm"');
    expect(deleteDialogSource).toContain("@keydown.esc.stop=\"emit('close')\"");
    expect(syncDialogSource).toContain("@keydown.esc.stop=\"emit('close')\"");
    expect(deleteDialogSource).toContain("danger-button");
    expect(syncDialogSource).toContain("overwriteWithTheImpactShown");
  });

  it("publishes one prioritized child modal so its parent can suspend", () => {
    expect(source).toContain("const activeModal = computed");
    expect(source).toContain("modalActiveChange: [active: boolean]");
    expect(source).toContain("activeModal === 'form'");
    expect(source).toContain("activeModal === 'sync'");
    expect(source).toContain("activeModal === 'delete'");
  });
});
