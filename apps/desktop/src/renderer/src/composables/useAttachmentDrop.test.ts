import { nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { mountConversationTestSetup } from "./conversation-view.test-support";
import { useAttachmentDrop } from "./useAttachmentDrop";

function dragEvent(types: string[], files: File[] = []) {
  const transfer = {
    types,
    items: [],
    files,
    dropEffect: "none"
  } as unknown as DataTransfer;
  const preventDefault = vi.fn();
  return {
    event: { dataTransfer: transfer, preventDefault } as unknown as DragEvent,
    preventDefault,
    transfer
  };
}

describe("attachment file drop", () => {
  it("shows the drop target only for files and adds them through the attachment flow", () => {
    const addFiles = vi.fn();
    const closeReferenceMenu = vi.fn();
    const { result, unmount } = mountConversationTestSetup(() =>
      useAttachmentDrop({
        canReceive: () => true,
        addFiles,
        closeReferenceMenu
      })
    );
    const text = dragEvent(["text/plain"]);
    result.handleDragEnter(text.event);
    expect(text.preventDefault).not.toHaveBeenCalled();
    expect(result.draggingFiles.value).toBe(false);

    const file = new File(["scene"], "scene.md", { type: "text/markdown" });
    const dragged = dragEvent(["Files"], [file]);
    result.handleDragEnter(dragged.event);
    result.handleDragEnter(dragged.event);
    result.handleDragLeave();
    expect(result.draggingFiles.value).toBe(true);
    result.handleDragOver(dragged.event);
    expect(dragged.preventDefault).toHaveBeenCalled();
    expect(dragged.transfer.dropEffect).toBe("copy");

    result.handleDrop(dragged.event);
    expect(result.draggingFiles.value).toBe(false);
    expect(closeReferenceMenu).toHaveBeenCalledOnce();
    expect(addFiles).toHaveBeenCalledWith([file]);
    unmount();
  });

  it("clears the hint and refuses files while the composer is unavailable", async () => {
    const enabled = ref(true);
    const addFiles = vi.fn();
    const { result, unmount } = mountConversationTestSetup(() =>
      useAttachmentDrop({
        canReceive: () => enabled.value,
        addFiles,
        closeReferenceMenu: vi.fn()
      })
    );
    const dragged = dragEvent(["Files"], [new File(["x"], "note.txt")]);
    result.handleDragEnter(dragged.event);
    expect(result.draggingFiles.value).toBe(true);

    enabled.value = false;
    await nextTick();
    expect(result.draggingFiles.value).toBe(false);
    result.handleDragOver(dragged.event);
    expect(dragged.transfer.dropEffect).toBe("none");
    result.handleDrop(dragged.event);
    expect(dragged.preventDefault).toHaveBeenCalled();
    expect(addFiles).not.toHaveBeenCalled();
    unmount();
  });
});
