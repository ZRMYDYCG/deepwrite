import {
  ImageModelCancelInputSchema,
  ImageModelCancelResultSchema,
  ImageModelSettingsInputSchema,
  ImageModelSettingsSchema,
  ImageModelTestInputSchema,
  ImageModelTestResultSchema,
  ImageUsageSchema,
  createEnvelope,
  type ImageModelsApi
} from "@deepwrite/contracts";
import { browserId, invokeCommand } from "./invoke";

export const imageModels: ImageModelsApi = {
  async getSettings() {
    const id = browserId("cmd_image_settings");
    return ImageModelSettingsSchema.parse(
      await invokeCommand(
        createEnvelope("imageModels.getSettings", {}, { id, correlationId: id })
      )
    );
  },
  async saveSettings(rawInput) {
    const input = ImageModelSettingsInputSchema.parse(rawInput);
    const id = browserId("cmd_image_save");
    return ImageModelSettingsSchema.parse(
      await invokeCommand(
        createEnvelope("imageModels.saveSettings", input, {
          id,
          correlationId: id
        })
      )
    );
  },
  async getUsage() {
    const id = browserId("cmd_image_usage");
    return ImageUsageSchema.parse(
      await invokeCommand(
        createEnvelope("imageModels.getUsage", {}, { id, correlationId: id })
      )
    );
  },
  async test(rawInput) {
    const input = ImageModelTestInputSchema.parse(rawInput);
    const id = browserId("cmd_image_test");
    return ImageModelTestResultSchema.parse(
      await invokeCommand(
        createEnvelope("imageModels.test", input, { id, correlationId: id })
      )
    );
  },
  async cancel(rawInput) {
    const input = ImageModelCancelInputSchema.parse(rawInput);
    const id = browserId("cmd_image_cancel");
    ImageModelCancelResultSchema.parse(
      await invokeCommand(
        createEnvelope("imageModels.cancel", input, { id, correlationId: id })
      )
    );
  }
};
