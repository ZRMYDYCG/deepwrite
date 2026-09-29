import {
  VoiceCancelInputSchema,
  VoiceCancelResultSchema,
  VoiceMicrophoneAccessSchema,
  VoiceSettingsInputSchema,
  VoiceSettingsSchema,
  VoiceTranscribeInputSchema,
  VoiceTranscribeResultSchema,
  VoiceUsageSchema,
  createEnvelope,
  type VoiceApi
} from "@deepwrite/contracts";
import { browserId, invokeCommand } from "./invoke";

export const voice: VoiceApi = {
  async getSettings() {
    const id = browserId("cmd_voice_settings");
    return VoiceSettingsSchema.parse(
      await invokeCommand(
        createEnvelope("voice.getSettings", {}, { id, correlationId: id })
      )
    );
  },
  async saveSettings(rawInput) {
    const input = VoiceSettingsInputSchema.parse(rawInput);
    const id = browserId("cmd_voice_save");
    return VoiceSettingsSchema.parse(
      await invokeCommand(
        createEnvelope("voice.saveSettings", input, { id, correlationId: id })
      )
    );
  },
  async getUsage() {
    const id = browserId("cmd_voice_usage");
    return VoiceUsageSchema.parse(
      await invokeCommand(
        createEnvelope("voice.getUsage", {}, { id, correlationId: id })
      )
    );
  },
  async transcribe(rawInput) {
    const input = VoiceTranscribeInputSchema.parse(rawInput);
    const id = browserId("cmd_voice_transcribe");
    return VoiceTranscribeResultSchema.parse(
      await invokeCommand(
        createEnvelope("voice.transcribe", input, { id, correlationId: id })
      )
    );
  },
  async cancel(rawInput) {
    const input = VoiceCancelInputSchema.parse(rawInput);
    const id = browserId("cmd_voice_cancel");
    VoiceCancelResultSchema.parse(
      await invokeCommand(
        createEnvelope("voice.cancel", input, { id, correlationId: id })
      )
    );
  },
  async requestMicrophoneAccess() {
    const id = browserId("cmd_voice_microphone");
    return VoiceMicrophoneAccessSchema.parse(
      await invokeCommand(
        createEnvelope(
          "voice.requestMicrophoneAccess",
          {},
          { id, correlationId: id }
        )
      )
    );
  }
};
