import { identityApi } from "./book-identity-utils";
import { ref, watch, type Ref } from "vue";
import type {
  BookIdentityCandidate,
  BookIdentityRound,
  BookIdentityUpdateCandidateInput,
  BookCoverCandidate,
  CoverImageRef,
  CoverLayout,
  BookIdentityExportCoverInput,
  BookIdentityField,
  ChatAssistantProjectRef
} from "@deepwrite/contracts/renderer";
import type { BookIdentityController } from "./useBookIdentity";
import { identityT as t } from "./book-identity-utils";
import { uiMessage } from "../../ui-feedback";
import { formatError } from "../../i18n/errors";
export function useIdentityCandidateEditing(
  c: BookIdentityController,
  book: Readonly<Ref<ChatAssistantProjectRef | null>>,
  field: Readonly<Ref<BookIdentityField>>
) {
  const editor = ref<{
    round?: BookIdentityRound;
    candidate?: BookIdentityCandidate;
  } | null>(null);
  const composer = ref<{
    round: BookIdentityRound;
    candidate: BookCoverCandidate;
    image: CoverImageRef;
  } | null>(null);
  const exportTarget = ref<Omit<
    BookIdentityExportCoverInput,
    "book" | "size"
  > | null>(null);
  const exportOpen = ref(false),
    exportSize = ref<"original" | "600x800" | "1080x1440">("original");
  async function saveCandidate(
    patch: BookIdentityUpdateCandidateInput["patch"]
  ) {
    if (!editor.value) return;
    const target = editor.value;
    let saved;
    if (editor.value.round && editor.value.candidate)
      saved = await c.update(
        editor.value.round.id,
        editor.value.candidate.id,
        patch
      );
    else if (field.value === "title")
      saved = await c.add({
        field: "title",
        candidate: {
          title: patch.title ?? "",
          subtitle: patch.subtitle ?? "",
          angle: patch.angle ?? "",
          rationale: patch.rationale ?? "",
          keywords: patch.keywords ?? []
        }
      });
    else if (field.value === "synopsis")
      saved = await c.add({
        field: "synopsis",
        candidate: {
          text: patch.text ?? "",
          hook: patch.hook ?? "",
          angle: patch.angle ?? "",
          rationale: patch.rationale ?? ""
        }
      });
    if (saved && editor.value === target) editor.value = null;
  }
  async function saveComposition(
    layout: CoverLayout,
    pngBase64: string,
    adopt: boolean
  ) {
    const target = composer.value;
    const origin = book.value ? { ...book.value } : null;
    if (!target || !origin) return;
    const result = await c.mutate(
      (book) =>
        identityApi().bookIdentity.saveComposedCover({
          book,
          roundId: target.round.id,
          candidateId: target.candidate.id,
          imageId: target.image.id,
          layout,
          pngBase64
        }),
      origin
    );
    if (!result) return;
    if (
      adopt &&
      !(await c.adopt(target.round, target.candidate, target.image.id, origin))
    )
      return;
    if (composer.value === target) composer.value = null;
    uiMessage.success(t("saved"));
  }
  function exportCandidate(
    round: BookIdentityRound,
    candidate: BookCoverCandidate,
    imageId: string
  ) {
    exportTarget.value = {
      roundId: round.id,
      candidateId: candidate.id,
      imageId
    };
    exportOpen.value = true;
  }
  async function exportImage() {
    if (!book.value) return;
    try {
      await identityApi().bookIdentity.exportCover({
        book: { ...book.value },
        size: exportSize.value,
        ...exportTarget.value
      });
      exportOpen.value = false;
    } catch (error) {
      uiMessage.error(formatError(error, t("failed")));
    }
  }
  watch(book, () => {
    editor.value = null;
    composer.value = null;
    exportOpen.value = false;
  });
  return {
    editor,
    composer,
    exportTarget,
    exportOpen,
    exportSize,
    saveCandidate,
    saveComposition,
    exportCandidate,
    exportImage
  };
}
