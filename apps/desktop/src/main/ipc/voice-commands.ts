import {
  VoiceSettingsSchema,
  VoiceTranscribeResultSchema,
  VoiceUsageSchema,
  type CommandEnvelope,
  type CommandResult
} from "@deepwrite/contracts";
import type { VoiceService } from "../voice/voice-service";

export async function handleVoiceCommands(
  command: CommandEnvelope,
  service: VoiceService,
  ownerId: number,
  requestMicrophoneAccess: () => Promise<boolean>
): Promise<CommandResult | undefined> {
  if (!command.type.startsWith("voice.")) return undefined;
  try {
    let payload: unknown;
    switch (command.type) {
      case "voice.getSettings":
        payload = VoiceSettingsSchema.parse(await service.getSettings());
        break;
      case "voice.saveSettings":
        payload = VoiceSettingsSchema.parse(
          await service.saveSettings(command.payload)
        );
        break;
      case "voice.getUsage":
        payload = VoiceUsageSchema.parse(await service.getUsage());
        break;
      case "voice.transcribe":
        payload = VoiceTranscribeResultSchema.parse(
          await service.transcribe(command.payload, ownerId)
        );
        break;
      case "voice.cancel":
        payload = {
          cancelled: service.cancel(command.payload.requestId, ownerId)
        };
        break;
      case "voice.requestMicrophoneAccess":
        payload = await requestMicrophoneAccess();
        break;
      default:
        return undefined;
    }
    return { status: "accepted", requestId: command.id, payload };
  } catch (error) {
    return {
      status: "rejected",
      requestId: command.id,
      error: {
        code: "voice.operation_failed",
        message:
          error instanceof Error ? error.message : "语音操作失败，请重试。"
      }
    };
  }
}
