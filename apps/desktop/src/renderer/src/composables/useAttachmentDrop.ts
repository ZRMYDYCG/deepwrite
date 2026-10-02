import { onBeforeUnmount, ref, watch } from "vue";

function containsFiles(transfer: DataTransfer | null): boolean {
  return Boolean(
    transfer &&
    (Array.from(transfer.types).includes("Files") ||
      Array.from(transfer.items).some((item) => item.kind === "file") ||
      transfer.files.length > 0)
  );
}

export function useAttachmentDrop(options: {
  canReceive: () => boolean;
  addFiles: (files: File[]) => void | Promise<void>;
  closeReferenceMenu: () => void;
}) {
  const draggingFiles = ref(false);
  let dragDepth = 0;

  function resetDrag(): void {
    dragDepth = 0;
    draggingFiles.value = false;
  }

  function handleDragEnter(event: DragEvent): void {
    if (!containsFiles(event.dataTransfer)) return;
    event.preventDefault();
    if (!options.canReceive()) {
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
      return;
    }
    dragDepth += 1;
    draggingFiles.value = true;
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }

  function handleDragOver(event: DragEvent): void {
    if (!containsFiles(event.dataTransfer)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = options.canReceive() ? "copy" : "none";
    }
  }

  function handleDragLeave(): void {
    if (dragDepth > 0) dragDepth -= 1;
    if (dragDepth === 0) draggingFiles.value = false;
  }

  function handleDrop(event: DragEvent): void {
    const transfer = event.dataTransfer;
    if (!containsFiles(transfer)) return;
    event.preventDefault();
    resetDrag();
    if (!options.canReceive() || !transfer) return;
    options.closeReferenceMenu();
    void options.addFiles(Array.from(transfer.files));
  }

  watch(
    () => options.canReceive(),
    (canReceive) => {
      if (!canReceive) resetDrag();
    }
  );
  onBeforeUnmount(resetDrag);

  return {
    draggingFiles,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop
  };
}
