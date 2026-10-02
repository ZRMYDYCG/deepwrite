import { z } from "zod";

export const PROMPT_ATTACHMENT_MAX_ITEMS = 8;
export const PROMPT_TEXT_ATTACHMENT_DEFAULT_CONTENT_LENGTH = 100_000;
export const PROMPT_TEXT_ATTACHMENT_MAX_CONTENT_LENGTH = 200_000;
export const PROMPT_TEXT_ATTACHMENTS_MAX_CONTENT_LENGTH = 200_000;
export const PROMPT_IMAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const PROMPT_IMAGE_ATTACHMENTS_MAX_BYTES = 25 * 1024 * 1024;

const PromptAttachmentBaseSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(240),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(25 * 1024 * 1024)
});

export const PromptTextAttachmentSchema = PromptAttachmentBaseSchema.extend({
  kind: z.literal("text"),
  mediaType: z.string().trim().min(1).max(120),
  content: z.string().max(PROMPT_TEXT_ATTACHMENT_MAX_CONTENT_LENGTH),
  truncated: z.boolean().optional(),
  originalLength: z.number().int().nonnegative().max(10_000_000).optional()
}).superRefine((value, context) => {
  if (
    value.truncated === true &&
    (value.originalLength === undefined ||
      value.originalLength <= value.content.length)
  ) {
    context.addIssue({
      code: "custom",
      path: ["originalLength"],
      message: "A truncated text attachment must report its original length."
    });
  }
  if (value.truncated !== true && value.originalLength !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["originalLength"],
      message: "An untruncated text attachment must omit originalLength."
    });
  }
});
export type PromptTextAttachment = z.infer<typeof PromptTextAttachmentSchema>;

export const PromptImageMediaTypeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
]);
export type PromptImageMediaType = z.infer<typeof PromptImageMediaTypeSchema>;

function decodedBase64ByteLength(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

export const PromptImageAttachmentSchema = PromptAttachmentBaseSchema.extend({
  kind: z.literal("image"),
  mediaType: PromptImageMediaTypeSchema,
  data: z
    .string()
    .min(1)
    .max(Math.ceil(PROMPT_IMAGE_ATTACHMENT_MAX_BYTES / 3) * 4 + 4)
    .regex(
      /^[A-Za-z0-9+/]+={0,2}$/,
      "Image attachment data must be base64 encoded."
    )
}).superRefine((value, context) => {
  if (value.size > PROMPT_IMAGE_ATTACHMENT_MAX_BYTES) {
    context.addIssue({
      code: "custom",
      path: ["size"],
      message: "Image attachment exceeds the per-file size limit."
    });
  }
  if (decodedBase64ByteLength(value.data) !== value.size) {
    context.addIssue({
      code: "custom",
      path: ["data"],
      message: "Image attachment byte size does not match its base64 payload."
    });
  }
});
export type PromptImageAttachment = z.infer<typeof PromptImageAttachmentSchema>;

export const UserPromptAttachmentSchema = z.discriminatedUnion("kind", [
  PromptTextAttachmentSchema,
  PromptImageAttachmentSchema
]);
export type UserPromptAttachment = z.infer<typeof UserPromptAttachmentSchema>;

export const UserPromptAttachmentsSchema = z
  .array(UserPromptAttachmentSchema)
  .max(PROMPT_ATTACHMENT_MAX_ITEMS)
  .superRefine((attachments, context) => {
    const ids = new Set<string>();
    let textLength = 0;
    let imageBytes = 0;
    attachments.forEach((attachment, index) => {
      if (ids.has(attachment.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Prompt attachment ids must be unique."
        });
      }
      ids.add(attachment.id);
      if (attachment.kind === "text") {
        textLength += attachment.content.length;
      } else {
        imageBytes += attachment.size;
      }
    });
    if (textLength > PROMPT_TEXT_ATTACHMENTS_MAX_CONTENT_LENGTH) {
      context.addIssue({
        code: "custom",
        message: "Text attachments exceed the total extracted-content limit."
      });
    }
    if (imageBytes > PROMPT_IMAGE_ATTACHMENTS_MAX_BYTES) {
      context.addIssue({
        code: "custom",
        message: "Image attachments exceed the total size limit."
      });
    }
  });
