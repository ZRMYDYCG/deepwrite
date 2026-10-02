import { z } from "zod";
import {
  ConversationHistoryIdSchema,
  ConversationHistoryKeySchema
} from "./conversation-history-mutations";
import { ConversationHistorySessionSchema } from "./conversation-history-queries";

export const ConversationHistoryArchiveCursorSchema = z
  .object({
    updatedAt: z.string().max(1024),
    key: ConversationHistoryKeySchema,
    sessionId: ConversationHistoryIdSchema
  })
  .strict();

export const ConversationHistoryArchiveListQuerySchema = z
  .object({
    after: ConversationHistoryArchiveCursorSchema.optional(),
    limit: z.number().int().min(1).max(100).default(50)
  })
  .strict();

export const ConversationHistoryArchiveListResultSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            key: ConversationHistoryKeySchema,
            session: ConversationHistorySessionSchema
          })
          .strict()
      )
      .max(100),
    next: ConversationHistoryArchiveCursorSchema.nullable()
  })
  .strict();

export const ConversationHistoryPurgeQuerySchema = z
  .object({
    key: ConversationHistoryKeySchema,
    sessionId: ConversationHistoryIdSchema,
    expectedRevision: z.number().int().nonnegative()
  })
  .strict();
export const ConversationHistoryPurgeResultSchema = z
  .object({ deleted: z.literal(true) })
  .strict();

export type ConversationHistoryArchiveListQuery = z.input<
  typeof ConversationHistoryArchiveListQuerySchema
>;
export type ConversationHistoryArchiveListResult = z.infer<
  typeof ConversationHistoryArchiveListResultSchema
>;
export type ConversationHistoryPurgeQuery = z.infer<
  typeof ConversationHistoryPurgeQuerySchema
>;
export type ConversationHistoryPurgeResult = z.infer<
  typeof ConversationHistoryPurgeResultSchema
>;
