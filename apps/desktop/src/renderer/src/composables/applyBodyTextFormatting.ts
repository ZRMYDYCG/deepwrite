import { createScopedTranslator } from "../i18n";
import { nextTick } from "vue";
import type { BodyTextFormat } from "@deepwrite/contracts";
import type { BodyTextFormattingOptions } from "./useBodyTextFormatting";
import { formatBodyText } from "../utils/bodyTextFormat";
import { uiMessage } from "../ui-feedback";

const t = createScopedTranslator("workspace.applyBodyTextFormatting");

export function applyBodyTextFormatting(
  options: BodyTextFormattingOptions,
  format: BodyTextFormat
): void {
  const content = options.content();
  const nextContent = formatBodyText(content, format);
  if (nextContent === content) {
    uiMessage.info(t("theManuscriptAlreadyMatchesTheFormattingRules"));
    return;
  }
  const input = options.editorInput();
  const key = options.documentKey();
  const scrollTop = input?.scrollTop;
  const selection = {
    start: Math.min(input?.selectionStart ?? 0, nextContent.length),
    end: Math.min(input?.selectionEnd ?? 0, nextContent.length)
  };
  const delta = options.recordChange(nextContent, selection);
  options.updateContent(nextContent, delta);
  uiMessage.success(t("manuscriptFormattingApplied"));
  void nextTick(() => {
    if (
      key !== options.documentKey() ||
      !input ||
      input !== options.editorInput()
    )
      return;
    input.setSelectionRange(selection.start, selection.end);
    if (scrollTop !== undefined) input.scrollTop = scrollTop;
  });
}
