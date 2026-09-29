import { t } from "../i18n";
import { computed, ref, getCurrentScope, onScopeDispose } from "vue";
import type { BodyTextKind } from "@deepwrite/contracts";
import type { TextSelectionRange } from "../utils/boundedTextHistory";
import { useSettingsStore } from "../stores/settingsStore";
import { uiMessage } from "../ui-feedback";

export interface BodyTextFormattingOptions {
  kind(): BodyTextKind | undefined;
  content(): string;
  disabled(): boolean;
  documentKey(): string;
  editorInput(): HTMLTextAreaElement | null | undefined;
  recordChange(
    content: string,
    selection: TextSelectionRange
  ): number | undefined;
  updateContent(content: string, nonWhitespaceDelta?: number): void;
}

export function useBodyTextFormatting(options: BodyTextFormattingOptions) {
  const settings = useSettingsStore();
  const pending = ref(false);
  let disposed = false;
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
    });
  const visible = computed(() => options.kind() !== undefined);
  const disabled = computed(
    () => pending.value || !visible.value || options.disabled()
  );

  async function format(): Promise<void> {
    const kind = options.kind();
    if (disposed || !kind || disabled.value) return;
    const key = options.documentKey();
    pending.value = true;
    try {
      const { applyBodyTextFormatting } =
        await import("./applyBodyTextFormatting");
      if (
        disposed ||
        options.disabled() ||
        options.documentKey() !== key ||
        options.kind() !== kind
      )
        return;
      applyBodyTextFormatting(
        options,
        settings.generalSettings.bodyTextFormats[kind]
      );
    } catch {
      uiMessage.error(
        t("workspace.bodyTextFormatting.couldNotFormatTheManuscriptTryAgain")
      );
    } finally {
      pending.value = false;
    }
  }
  return { visible, disabled, format };
}
