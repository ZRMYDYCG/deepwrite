import editorMetadataSource from "./EditorDocumentMetadata.vue?raw";
import { describe, expect, it } from "vitest";
import iconSource from "./AppIcon.vue?raw";
import longManuscriptSource from "./LongManuscriptEditor.vue?raw";
import longWorkspaceSource from "./LongWorkspaceEditor.vue?raw";
import markdownContentSource from "./MarkdownContent.vue?raw";
import metaRowSource from "./DocumentMetaRow.vue?raw";
import outlineSource from "./PreviewOutlinePopover.vue?raw";
import rightEditorSource from "./RightEditorPane.vue?raw";

describe("preview document outline", () => {
  it("uses a themed, teleported, keyboard-accessible outline card", () => {
    expect(outlineSource).toContain('<Teleport to="body">');
    expect(outlineSource).toContain("openDocumentOutline");
    expect(outlineSource).toContain("documentOutline");
    expect(outlineSource).toContain('event.key === "Escape"');
    expect(outlineSource).toContain('event.key === "ArrowDown"');
    expect(outlineSource).toContain("handleDocumentPointerdown");
    expect(outlineSource).toContain(
      '<style scoped src="./preview-outline-popover.css"></style>'
    );
  });

  it("jumps only inside the active preview and focuses the target heading", () => {
    expect(outlineSource).toContain("props.previewElement");
    expect(outlineSource).toContain("data-markdown-heading-index");
    expect(outlineSource).toContain('behavior: "smooth"');
    expect(outlineSource).toContain("target.focus({ preventScroll: true })");
    expect(outlineSource).toContain("noMarkdownHeadingsInThisManuscript");
  });

  it("keeps the outline control in preview toolbars", () => {
    const rightTextTools = rightEditorSource
      .split('class="editor-text-tools"')[1]
      ?.split("</div>")[0];
    const longTextTools = [
      ...longWorkspaceSource.matchAll(
        /class="long-editor-text-tools"[\s\S]*?<\/div>/g
      )
    ];

    expect(rightTextTools).toContain("<PreviewOutlinePopover");
    expect(rightTextTools).toContain(`v-if="viewMode === 'preview'"`);
    expect(longWorkspaceSource.match(/<PreviewOutlinePopover/g)).toHaveLength(
      2
    );
    expect(longTextTools).toHaveLength(2);
    expect(
      longTextTools.every(([group]) => group.includes("<PreviewOutlinePopover"))
    ).toBe(true);
    expect(outlineSource).toContain('<AppIcon name="outline"');
    expect(iconSource).toContain("name === 'outline'");
    expect(outlineSource).toContain('v-if="!iconOnly"');
    expect(metaRowSource).not.toContain("<PreviewOutlinePopover");
    expect(markdownContentSource).toContain("annotateHeadings: false");
  });

  it("covers short, library, long-form, and story-plot text previews", () => {
    expect(rightEditorSource).toContain("<EditorDocumentMetadata");
    expect(rightEditorSource).toContain(
      `v-if="document.domain !== 'creation'"`
    );
    expect(editorMetadataSource).toContain("<DocumentMetaRow");
    expect(rightEditorSource).toContain("annotate-headings");
    expect(longManuscriptSource).toContain("annotate-headings");
    expect(longManuscriptSource).not.toContain("<DocumentMetaRow");
    expect(longWorkspaceSource).not.toContain("<DocumentMetaRow");
    expect(longWorkspaceSource.match(/annotate-headings/g)).toHaveLength(2);
    expect(longWorkspaceSource).toContain("storyEventManuscript");
  });
});
