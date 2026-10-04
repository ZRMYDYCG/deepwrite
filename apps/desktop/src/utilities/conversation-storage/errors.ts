export class ConversationStorageError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ConversationStorageError";
  }
}

/** The current page cannot fit this message's required projection fields. */
export class MessageProjectionBudgetError extends Error {}
