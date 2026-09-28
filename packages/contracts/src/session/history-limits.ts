// Transport limits, not model limits. The runtime summarizes complete restored
// messages in bounded requests before the first model turn.
export const SESSION_CONVERSATION_HISTORY_MAX_MESSAGES = 2_000;
export const SESSION_CONVERSATION_HISTORY_MAX_MESSAGE_LENGTH = 1_000_000;
export const SESSION_CONVERSATION_HISTORY_MAX_CONTENT_LENGTH = 4_000_000;
