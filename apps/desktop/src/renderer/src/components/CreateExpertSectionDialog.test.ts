import { describe, expect, it } from "vitest";
import source from "./CreateExpertSectionDialog.vue?raw";

describe("CreateExpertSectionDialog", () => {
  it("asks for a section name before creating an expert draft section", () => {
    expect(source).toContain("newMessage");
    expect(source).toContain("nameMessage");
    expect(source).toContain("title.value = suggestedTitle");
    expect(source).toContain("titleInput.value?.select()");
    expect(source).toContain("DraftSectionTitleSchema.safeParse(title.value)");
    expect(source).toContain("enterAValueName");
    expect(source).toContain('emit("submit", parsed.data)');
    expect(source).toContain("create");
    expect(source).not.toContain("is-danger");
    expect(source).not.toContain("<select");
  });

  it("uses non-layout feedback, themed surfaces, and a neutral primary action", () => {
    expect(source).toContain('<Teleport to="body">');
    expect(source).toContain(
      'class="dialog-backdrop create-expert-section-overlay"'
    );
    expect(source).not.toContain("backdrop-filter:");
    expect(source).toContain("var(--surface-raised)");
    expect(source).toContain("var(--theme-line)");
    expect(source).toContain("var(--text-primary)");
    expect(source).toContain("var(--neutral-solid)");
  });
});
