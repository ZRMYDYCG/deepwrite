import { effectScope, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { UserPromptAttachment } from "@deepwrite/contracts/renderer";
import { uiMessage } from "../ui-feedback";
import { useConversationComposer } from "./useConversationComposer";

function textAttachment(id: string, length: number): UserPromptAttachment {
  return {
    id,
    kind: "text",
    name: `${id}.txt`,
    mediaType: "text/plain",
    size: length,
    content: "字".repeat(length)
  };
}

describe("conversation composer attachment budget", () => {
  it("blocks combined attachments above the working budget cap and sends a smaller set", () => {
    const scope = effectScope();
    const pendingAttachments = ref<UserPromptAttachment[]>([
      textAttachment("first", 30_000),
      textAttachment("second", 30_000)
    ]);
    const emitSend = vi.fn();
    const warning = vi.spyOn(uiMessage, "warning").mockReturnValue(-1);
    const composer = scope.run(() =>
      useConversationComposer({
        draft: () => "请阅读附件",
        canSend: () => true,
        canSendAttachments: () => true,
        runtimeAvailable: () => true,
        libraryDomain: () => undefined,
        availableSkills: () => [],
        availableMaterials: () => [],
        editorReferences: () => [],
        textAttachmentMaxCharacters: () => 50_000,
        textAttachmentsTotalMaxCharacters: () => 57_600,
        pendingAttachments,
        readingAttachments: ref(false),
        emitDraft: vi.fn(),
        emitSend,
        emitClearEditorReferences: vi.fn()
      })
    )!;

    try {
      composer.submitMessage();
      expect(emitSend).not.toHaveBeenCalled();
      expect(warning).toHaveBeenCalledWith(expect.stringContaining("57,600"));
      expect(pendingAttachments.value).toHaveLength(2);

      pendingAttachments.value = pendingAttachments.value.slice(0, 1);
      composer.submitMessage();
      expect(emitSend).toHaveBeenCalledWith([
        expect.objectContaining({ id: "first" })
      ]);
      expect(pendingAttachments.value).toEqual([]);
    } finally {
      scope.stop();
      warning.mockRestore();
    }
  });
});
