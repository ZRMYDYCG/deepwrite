import { createScopedTranslator } from "../i18n";
import type { VoiceProfileId } from "@deepwrite/contracts";

const t = createScopedTranslator("workspace.voiceSettingsOptions");

export const VOICE_PROVIDER_OPTIONS = [
  {
    value: "mimo",
    get label() {
      return t("xiaomiMimo");
    }
  },
  {
    value: "aliyun",
    get label() {
      return t("alibabaQwen");
    }
  }
];

export const VOICE_ACCESS_OPTIONS = [
  { value: "token-plan", label: "Token Plan" },
  {
    value: "api",
    get label() {
      return t("openPlatformPayAsYouGo");
    }
  }
];

export const VOICE_LANGUAGE_OPTIONS = [
  {
    value: "auto",
    get label() {
      return t("autoDetect");
    }
  },
  {
    value: "zh",
    get label() {
      return t("chinese");
    }
  },
  {
    value: "en",
    get label() {
      return t("english");
    }
  }
];

export const VOICE_PROFILE_LABELS: Record<VoiceProfileId, string> = {
  "mimo-token-plan": "MiMo · Token Plan",
  get "mimo-api"() {
    return t("mimoOpenPlatform");
  },
  get "aliyun-token-plan"() {
    return t("alibabaQwenTokenPlan");
  },
  get "aliyun-api"() {
    return t("alibabaQwenOpenPlatform");
  }
};
