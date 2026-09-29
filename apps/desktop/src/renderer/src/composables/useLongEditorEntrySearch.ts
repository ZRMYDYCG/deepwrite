import { t } from "../i18n";
import type {
  DeepWriteApi,
  LongSearchHit,
  LongWorkspaceRoot
} from "@deepwrite/contracts";
import { watch, type ComputedRef } from "vue";
import type { EditorEntrySearchResult } from "../types/editorEntrySearch";
import { useEditorEntrySearch } from "./useEditorEntrySearch";

function compactLongSearchSnippet(snippet: string): string {
  return snippet.replace(/\s+/gu, " ").trim();
}

export function longEntrySearchResults(
  hits: readonly LongSearchHit[]
): EditorEntrySearchResult[] {
  const seen = new Set<string>();
  return hits.flatMap((hit) => {
    if (seen.has(hit.fileId)) return [];
    seen.add(hit.fileId);
    const detail = compactLongSearchSnippet(hit.snippet);
    return [
      {
        id: hit.fileId,
        title: hit.title,
        ...(detail ? { detail } : {})
      }
    ];
  });
}

export function useLongEditorEntrySearch(options: {
  bookId: () => string;
  scope: ComputedRef<LongWorkspaceRoot>;
  api: () => DeepWriteApi["long"] | undefined;
  navigate: (fileId: string) => void | Promise<void>;
}) {
  const search = useEditorEntrySearch({
    async search(query) {
      const api = options.api();
      if (!api)
        throw new Error(
          t(
            "workspace.longEditorEntrySearch.novelEntrySearchIsNotAvailableInThisEnvironment"
          )
        );
      const result = await api.search({
        bookId: options.bookId(),
        query,
        scope: options.scope.value,
        limit: 60,
        maxSnippetCharacters: 180
      });
      return longEntrySearchResults(result.hits);
    },
    navigate: ({ id }) => options.navigate(id)
  });

  watch([options.scope, options.bookId], () => search.reset());
  return search;
}
