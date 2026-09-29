import { z } from "zod";
import { AgentRuntimeRefSchema } from "./agent-event-identity";

export const AGENT_USER_INPUT_MAX_QUESTIONS = 3;
export const AGENT_USER_INPUT_MAX_OPTIONS = 5;

export const AgentUserInputSourceSchema = z.enum([
  "ask_user_question",
  "cross_stage_write"
]);
export type AgentUserInputSource = z.infer<typeof AgentUserInputSourceSchema>;

export const AgentUserInputOptionSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500).optional()
  })
  .strict();
export type AgentUserInputOption = z.infer<typeof AgentUserInputOptionSchema>;

export const AgentUserInputQuestionSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    question: z.string().trim().min(1).max(1_000),
    header: z.string().trim().min(1).max(40).optional(),
    options: z
      .array(AgentUserInputOptionSchema)
      .min(2)
      .max(AGENT_USER_INPUT_MAX_OPTIONS)
      .optional(),
    multi_select: z.boolean().optional()
  })
  .strict()
  .superRefine((value, context) => {
    const optionIds = new Set<string>();
    value.options?.forEach((option, index) => {
      if (optionIds.has(option.id)) {
        context.addIssue({
          code: "custom",
          path: ["options", index, "id"],
          message: `Duplicate option id: ${option.id}`
        });
      }
      optionIds.add(option.id);
    });
    if (value.multi_select === true && !value.options) {
      context.addIssue({
        code: "custom",
        path: ["multi_select"],
        message: "Multi-select questions require options."
      });
    }
  });
export type AgentUserInputQuestion = z.infer<
  typeof AgentUserInputQuestionSchema
>;

export const AgentUserInputQuestionsSchema = z
  .array(AgentUserInputQuestionSchema)
  .min(1)
  .max(AGENT_USER_INPUT_MAX_QUESTIONS)
  .superRefine((questions, context) => {
    const questionIds = new Set<string>();
    questions.forEach((question, index) => {
      if (questionIds.has(question.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `Duplicate question id: ${question.id}`
        });
      }
      questionIds.add(question.id);
    });
  });

export const AgentUserInputAnswerSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    selectedOptionIds: z
      .array(z.string().trim().min(1).max(80))
      .max(AGENT_USER_INPUT_MAX_OPTIONS)
      .optional(),
    text: z.string().max(4_000).optional()
  })
  .strict()
  .superRefine((value, context) => {
    const selected = value.selectedOptionIds ?? [];
    if (new Set(selected).size !== selected.length) {
      context.addIssue({
        code: "custom",
        path: ["selectedOptionIds"],
        message: "Selected option ids must be unique."
      });
    }
    if (selected.length === 0 && !value.text?.trim()) {
      context.addIssue({
        code: "custom",
        message: "An answer must contain a selected option or text."
      });
    }
  });
export type AgentUserInputAnswer = z.infer<typeof AgentUserInputAnswerSchema>;

export const AgentUserInputRequestedPayloadSchema = z
  .object({
    sessionId: z.string().min(1),
    runId: z.string().min(1),
    requestId: z.string().min(1),
    toolCallId: z.string().min(1),
    source: AgentUserInputSourceSchema,
    questions: AgentUserInputQuestionsSchema,
    runtime: AgentRuntimeRefSchema
  })
  .strict();
export type AgentUserInputRequestedPayload = z.infer<
  typeof AgentUserInputRequestedPayloadSchema
>;

export const SessionUserInputResponsePayloadSchema = z
  .object({
    sessionId: z.string().min(1),
    runId: z.string().min(1),
    requestId: z.string().min(1),
    answers: z
      .array(AgentUserInputAnswerSchema)
      .min(1)
      .max(AGENT_USER_INPUT_MAX_QUESTIONS)
  })
  .strict();
export type SessionUserInputResponsePayload = z.infer<
  typeof SessionUserInputResponsePayloadSchema
>;

export const SessionUserInputResponseAcceptedPayloadSchema =
  SessionUserInputResponsePayloadSchema.pick({
    sessionId: true,
    runId: true,
    requestId: true
  }).extend({ resolvedAt: z.string().datetime() });
export type SessionUserInputResponseAcceptedPayload = z.infer<
  typeof SessionUserInputResponseAcceptedPayloadSchema
>;
