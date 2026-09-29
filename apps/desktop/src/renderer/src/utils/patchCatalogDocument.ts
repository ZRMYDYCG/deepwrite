import type { WorkspaceDocument } from "../types/workspace";

/** Body/version overlays preserve lazy display metadata; explicit edits override it. */
export function patchCatalogDocument(
  document: WorkspaceDocument,
  patch: Partial<WorkspaceDocument>
): WorkspaceDocument {
  return Object.defineProperties(
    {},
    {
      ...Object.getOwnPropertyDescriptors(document),
      ...Object.getOwnPropertyDescriptors(patch)
    }
  ) as WorkspaceDocument;
}
