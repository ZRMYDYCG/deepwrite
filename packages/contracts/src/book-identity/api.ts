import type { ChatAssistantProjectRef } from "../chat-assistant-base";
import type { BookIdentityField } from "./limits";
import type { BookIdentityRecord } from "./record";
import type { BookCoverCandidate } from "./candidates";
import type {
  BookIdentityAddManualCandidateInput,
  BookIdentityUpdateCandidateInput,
  BookIdentityAdoptInput,
  BookIdentityRenderCoverInput,
  BookIdentitySaveComposedCoverInput,
  BookIdentityExportCoverInput
} from "./commands";
export interface BookIdentityApi {
  get(input: { book: ChatAssistantProjectRef }): Promise<BookIdentityRecord>;
  inheritBook(input: {
    book: ChatAssistantProjectRef;
  }): Promise<BookIdentityRecord>;
  addManualCandidate(
    input: BookIdentityAddManualCandidateInput
  ): Promise<BookIdentityRecord>;
  updateCandidate(
    input: BookIdentityUpdateCandidateInput
  ): Promise<BookIdentityRecord>;
  adopt(input: BookIdentityAdoptInput): Promise<BookIdentityRecord>;
  clearAdoption(input: {
    book: ChatAssistantProjectRef;
    field: BookIdentityField;
  }): Promise<BookIdentityRecord>;
  deleteRound(input: {
    book: ChatAssistantProjectRef;
    roundId: string;
  }): Promise<BookIdentityRecord>;
  pruneRounds(input: {
    book: ChatAssistantProjectRef;
    field: BookIdentityField;
  }): Promise<BookIdentityRecord>;
  renderCover(input: BookIdentityRenderCoverInput): Promise<BookCoverCandidate>;
  cancelRender(input: { requestId: string }): Promise<void>;
  saveComposedCover(
    input: BookIdentitySaveComposedCoverInput
  ): Promise<BookIdentityRecord>;
  exportCover(
    input: BookIdentityExportCoverInput
  ): Promise<{ cancelled: boolean; path?: string }>;
}
