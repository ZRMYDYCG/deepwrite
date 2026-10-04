import type { ImageModelSettings, ImageModelSettingsInput } from "./settings";
import type { ImageUsageRecord } from "./usage";
import type { ImageModelTestInput, ImageModelTestResult } from "./commands";
export interface ImageModelsApi {
  getSettings(): Promise<ImageModelSettings>;
  saveSettings(input: ImageModelSettingsInput): Promise<ImageModelSettings>;
  getUsage(): Promise<ImageUsageRecord[]>;
  test(input: ImageModelTestInput): Promise<ImageModelTestResult>;
  cancel(input: { requestId: string }): Promise<void>;
}
