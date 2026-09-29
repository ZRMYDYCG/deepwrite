import { t } from "../i18n";
import { onBeforeUnmount, type ComponentPublicInstance } from "vue";
import {
  isLongWorkspaceEditorPort,
  type LongWorkspaceEditorPort
} from "./useLongWorkspaceSessionCoordinator";
import type { EditorTextReference } from "../types/conversation";

export function useLongWorkspaceModuleEditorBridge(options: {
  publish(port: LongWorkspaceEditorPort | null): void;
  warn(message: string): void;
}) {
  let currentEditorPort: LongWorkspaceEditorPort | null = null;

  function captureEditorPort(
    instance: Element | ComponentPublicInstance | null
  ): void {
    const nextPort = isLongWorkspaceEditorPort(instance) ? instance : null;
    if (nextPort === currentEditorPort) return;
    currentEditorPort = nextPort;
    options.publish(nextPort);
  }

  async function locateEditorReference(
    reference: EditorTextReference
  ): Promise<void> {
    if (await currentEditorPort?.locateEditorReference(reference)) return;
    options.warn(
      t(
        "workspace.longWorkspaceModuleEditorBridge.theReferencedNovelTextIsNoLongerInThe"
      )
    );
  }

  onBeforeUnmount(() => {
    if (!currentEditorPort) return;
    currentEditorPort = null;
    options.publish(null);
  });

  return {
    captureEditorPort,
    locateEditorReference
  };
}
