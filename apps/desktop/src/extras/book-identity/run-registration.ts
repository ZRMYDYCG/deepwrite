import type {
  BookIdentityField,
  BookIdentityRound,
  ChatAssistantProjectRef
} from "@deepwrite/contracts";

/** Created by Main from the resolved task, never supplied by Agent. */
export interface BookIdentityRunRegistration {
  book: ChatAssistantProjectRef;
  field: BookIdentityField;
  roundId: string;
  candidateCount: number;
  profile: { id: string; name: string };
  model?: { id: string; label: string };
  request: BookIdentityRound["request"];
  submitted?: boolean;
  submitting?: boolean;
}
