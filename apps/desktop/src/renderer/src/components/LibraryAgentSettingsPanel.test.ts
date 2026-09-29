import { describe, expect, it } from "vitest";
import source from "./LibraryAgentSettingsPanel.vue?raw";

describe("LibraryAgentSettingsPanel", () => {
  it("uses one domain-parameterized panel for material and skill agents", () => {
    expect(source).toContain("domain: LibraryAgentDomain");
    expect(source).toContain("skill: {");
    expect(source).toContain("material: {");
    expect(source).toContain("skillLibraryAgent");
    expect(source).toContain("materialLibraryAgent");
  });

  it("provides tabbed configuration for system prompt and available skills", () => {
    expect(source).toContain('id: "system-prompt"');
    expect(source).toContain('id: "available-skills"');
    expect(source).toContain("systemPrompt");
    expect(source).toContain("availableSkills");
    expect(source).toContain("settings-nav");
    expect(source).not.toContain("agent-header");
    expect(source).not.toContain("工具能力");
  });

  it("edits configured skills with name, description, and content", () => {
    expect(source).toContain("readAccess.skills");
    expect(source).toContain("skillName");
    expect(source).toContain("skillDescription");
    expect(source).toContain("skillContent");
    expect(source).toContain("addSkill");
    expect(source).not.toContain("SKILL_OPTIONS");
    expect(source).not.toContain("handleSkillKindChange");
  });

  it("emits a complete settings save and a domain-scoped reset", () => {
    expect(source).toContain('emit("save", { agents })');
    expect(source).toContain('emit("reset", props.domain)');
    expect(source).toContain("restoreDefaults");
  });

  it("uses floating validation feedback without inserting transient messages", () => {
    expect(source).toContain("uiMessage.warning");
    expect(source).not.toContain("errorMessage");
    expect(source).not.toContain("statusMessage");
    expect(source).not.toContain("settings-error");
  });
});
