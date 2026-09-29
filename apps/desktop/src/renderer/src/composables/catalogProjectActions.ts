import { formatError } from "../i18n/errors";
import { createScopedTranslator } from "../i18n";
import type {
  CatalogLibraryProjectDomain,
  DeepWriteApi
} from "@deepwrite/contracts";
import type { Ref } from "vue";
import { uiMessage } from "../ui-feedback";

const t = createScopedTranslator("workspace");

/** Loaded only when the existing directory menu requests a legacy import. */
export async function importLegacyLibraryAction(
  domain: CatalogLibraryProjectDomain,
  options: {
    api: DeepWriteApi | undefined;
    pending: Ref<boolean>;
    refresh(): Promise<void>;
    selectLibrary(id: string | undefined): void;
  }
): Promise<void> {
  if (!options.api) {
    uiMessage.warning(
      t(
        "catalogProjectActions.theBrowserPreviewCannotImportLegacyLibrariesUseThe"
      )
    );
    return;
  }
  if (options.pending.value) return;
  options.pending.value = true;
  try {
    const result = await options.api.catalog.importLegacyLibrary(domain);
    if (!result) return;
    await options.refresh();
    options.selectLibrary(result.imported.at(-1)?.id);
    const libraryLabel =
      domain === "material"
        ? t("catalogWorkspace.material")
        : t("catalogWorkspace.skill");
    if (result.failures.length === 0) {
      uiMessage.success(
        result.imported.length === 1
          ? t("catalogProjectActions.importedLegacyLibraryAsANewLibrary", {
              libraryLabel: libraryLabel,
              value: result.imported[0]!.title
            })
          : t("catalogProjectActions.importedLegacyLibrariesAsNewLibraries", {
              length: result.imported.length,
              libraryLabel: libraryLabel
            })
      );
    } else {
      const failureSummary = result.failures
        .map(({ fileName, message }) => `${fileName}：${message}`)
        .join("；");
      if (result.imported.length > 0)
        uiMessage.warning(
          t("catalogProjectActions.importedLegacyLibrariesFailed", {
            length: result.imported.length,
            libraryLabel: libraryLabel,
            length2: result.failures.length,
            failureSummary: failureSummary
          })
        );
      else
        uiMessage.error(
          t("catalogProjectActions.failedToImportLegacyLibraries", {
            libraryLabel: libraryLabel,
            failureSummary: failureSummary
          })
        );
    }
  } catch (error: unknown) {
    uiMessage.error(
      formatError(
        error,
        t("catalogProjectActions.failedToImportLegacyLibraries2")
      )
    );
  } finally {
    options.pending.value = false;
  }
}

export async function openCatalogProjectAction(
  domain: "book" | CatalogLibraryProjectDomain,
  options: {
    api: DeepWriteApi | undefined;
    pending: Ref<boolean>;
    refresh(): Promise<void>;
    select(
      opened: NonNullable<
        Awaited<ReturnType<DeepWriteApi["catalog"]["openProject"]>>
      >
    ): Promise<void>;
  }
): Promise<void> {
  if (!options.api) {
    uiMessage.warning(
      t("catalogProjectActions.theBrowserPreviewCannotOpenLocalFoldersUseThe")
    );
    return;
  }
  if (options.pending.value) return;
  options.pending.value = true;
  try {
    const opened = await options.api.catalog.openProject(domain);
    if (!opened) return;
    await options.refresh();
    await options.select(opened);
    uiMessage.success(
      t("catalogProjectActions.opened", {
        value:
          opened.domain === "book"
            ? t("catalogProjectActions.book")
            : opened.domain === "material"
              ? t("catalogWorkspace.materialLibrary")
              : t("catalogWorkspace.skillLibrary"),
        title: opened.title
      })
    );
  } catch (error: unknown) {
    uiMessage.error(
      formatError(error, t("catalogProjectActions.failedToOpenLocalProject"))
    );
  } finally {
    options.pending.value = false;
  }
}
