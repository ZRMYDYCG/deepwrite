import { createScopedTranslator } from "../../i18n";
import type { DeepWriteApi, WorkspaceType } from "@deepwrite/contracts";

const t = createScopedTranslator("workspace");

export async function loadWritingContextForPrompt(
  catalog: DeepWriteApi["catalog"],
  bookId: string,
  workspaceType: WorkspaceType,
  warn?: (message: string) => void
): Promise<string | undefined> {
  const label =
    workspaceType === "script"
      ? t("catalogWorkspace.screenplay")
      : t("catalogWorkspace.shortStory");
  try {
    const result = await catalog.readWritingContext({ bookId });
    if (result.truncated) {
      warn?.(
        t("writingContext.theContextIsTooLongOnlyATruncatedAgents", {
          label: label
        })
      );
    }
    return result.content;
  } catch (error: unknown) {
    warn?.(
      error instanceof Error
        ? t("writingContext.theContextWasNotIncluded", {
            label: label,
            message: error.message
          })
        : t("writingContext.theContextWasNotIncludedThisTurnWillStill", {
            label: label
          })
    );
    return undefined;
  }
}
