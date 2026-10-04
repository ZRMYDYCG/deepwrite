import { z } from "zod";
import { EnvelopeBaseSchema } from "./envelope";
import { HttpsBaseUrlSchema } from "./https-base-url";

export const VOICE_MAX_DURATION_MS = 600_000;
// Ten minutes of 16 kHz mono PCM16 WAV is about 25.6 million base64 characters.
export const VOICE_MAX_BASE64_LENGTH = 26_000_000;
export const VoiceProfileIdSchema = z.enum([
  "mimo-token-plan",
  "mimo-api",
  "aliyun-token-plan",
  "aliyun-api"
]);
export type VoiceProfileId = z.infer<typeof VoiceProfileIdSchema>;
export const VoiceLanguageSchema = z.enum(["auto", "zh", "en"]);
export type VoiceLanguage = z.infer<typeof VoiceLanguageSchema>;

const ProfileFields = {
  id: VoiceProfileIdSchema,
  baseUrl: HttpsBaseUrlSchema,
  model: z.string().trim().min(1).max(160)
};
export const VoiceProfileSchema = z
  .object({
    ...ProfileFields,
    hasApiKey: z.boolean()
  })
  .strict();
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;
export const VoiceProfileInputSchema = z
  .object({
    ...ProfileFields,
    apiKey: z.string().trim().max(4096).optional(),
    clearApiKey: z.boolean().optional()
  })
  .strict();
const SettingsFields = {
  activeProfileId: VoiceProfileIdSchema,
  language: VoiceLanguageSchema,
  microphoneId: z.string().max(512)
};
const uniqueProfiles = (profiles: { id: VoiceProfileId }[]) =>
  new Set(profiles.map((profile) => profile.id)).size === 4;
export const VoiceSettingsSchema = z
  .object({
    ...SettingsFields,
    profiles: z
      .array(VoiceProfileSchema)
      .length(4)
      .refine(uniqueProfiles, "语音配置必须包含四种独立接入方式。")
  })
  .strict();
export type VoiceSettings = z.infer<typeof VoiceSettingsSchema>;
export const VoiceSettingsInputSchema = z
  .object({
    ...SettingsFields,
    profiles: z
      .array(VoiceProfileInputSchema)
      .length(4)
      .refine(uniqueProfiles, "语音配置必须包含四种独立接入方式。")
  })
  .strict();
export type VoiceSettingsInput = z.infer<typeof VoiceSettingsInputSchema>;

export const VOICE_PROFILE_DEFAULTS = [
  {
    id: "mimo-token-plan",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
    model: "mimo-v2.5-asr"
  },
  {
    id: "mimo-api",
    baseUrl: "https://api.xiaomimimo.com/v1",
    model: "mimo-v2.5-asr"
  },
  {
    id: "aliyun-token-plan",
    baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com",
    model: "qwen-audio-3.0-asr-flash"
  },
  {
    id: "aliyun-api",
    baseUrl: "https://dashscope.aliyuncs.com",
    model: "qwen-audio-3.0-asr-flash"
  }
] as const;
export function createDefaultVoiceSettings(): VoiceSettings {
  return {
    activeProfileId: "mimo-token-plan",
    language: "auto",
    microphoneId: "",
    profiles: VOICE_PROFILE_DEFAULTS.map((profile) => ({
      ...profile,
      hasApiKey: false
    }))
  };
}

export const VoiceRequestIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_-]+$/u);
export const VoiceTranscribeInputSchema = z
  .object({
    requestId: VoiceRequestIdSchema,
    profileId: VoiceProfileIdSchema,
    audioBase64: z
      .string()
      .min(60)
      .max(VOICE_MAX_BASE64_LENGTH)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/u),
    durationMs: z.number().finite().positive().max(VOICE_MAX_DURATION_MS)
  })
  .strict();
export type VoiceTranscribeInput = z.infer<typeof VoiceTranscribeInputSchema>;
export const VoiceCancelInputSchema = z
  .object({ requestId: VoiceRequestIdSchema })
  .strict();
export const VoiceUsageRecordSchema = z
  .object({
    requestId: VoiceRequestIdSchema,
    profileId: VoiceProfileIdSchema,
    model: z.string().min(1).max(160),
    createdAt: z.string().datetime(),
    durationMs: z.number().finite().nonnegative(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional()
  })
  .strict();
export type VoiceUsageRecord = z.infer<typeof VoiceUsageRecordSchema>;
export const VoiceUsageSchema = z.array(VoiceUsageRecordSchema);
export const VoiceTranscribeResultSchema = z
  .object({
    text: z.string().max(100_000),
    requestId: VoiceRequestIdSchema,
    profileId: VoiceProfileIdSchema,
    usage: VoiceUsageRecordSchema
  })
  .strict();
export type VoiceTranscribeResult = z.infer<typeof VoiceTranscribeResultSchema>;
export const VoiceMicrophoneAccessSchema = z.boolean();
export const VoiceCancelResultSchema = z
  .object({ cancelled: z.boolean() })
  .strict();

export const VoiceCommandSchemas = [
  EnvelopeBaseSchema.extend({
    type: z.literal("voice.getSettings"),
    payload: z.object({}).strict()
  }),
  EnvelopeBaseSchema.extend({
    type: z.literal("voice.saveSettings"),
    payload: VoiceSettingsInputSchema
  }),
  EnvelopeBaseSchema.extend({
    type: z.literal("voice.getUsage"),
    payload: z.object({}).strict()
  }),
  EnvelopeBaseSchema.extend({
    type: z.literal("voice.transcribe"),
    payload: VoiceTranscribeInputSchema
  }),
  EnvelopeBaseSchema.extend({
    type: z.literal("voice.cancel"),
    payload: VoiceCancelInputSchema
  }),
  EnvelopeBaseSchema.extend({
    type: z.literal("voice.requestMicrophoneAccess"),
    payload: z.object({}).strict()
  })
] as const;

export interface VoiceApi {
  getSettings(): Promise<VoiceSettings>;
  saveSettings(input: VoiceSettingsInput): Promise<VoiceSettings>;
  getUsage(): Promise<VoiceUsageRecord[]>;
  transcribe(input: VoiceTranscribeInput): Promise<VoiceTranscribeResult>;
  cancel(input: { requestId: string }): Promise<void>;
  requestMicrophoneAccess(): Promise<boolean>;
}
