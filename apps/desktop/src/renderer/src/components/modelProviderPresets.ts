import { createScopedTranslator } from "../i18n";
import type { ModelApi } from "@deepwrite/contracts";

const t = createScopedTranslator("components.modelProviderPresets");

interface ModelProviderPresetTarget {
  provider: string;
  api: ModelApi;
  baseUrl: string;
}

interface ModelProviderOption {
  value: string;
  label: string;
  description?: string;
  api?: ModelApi;
  baseUrl?: string;
}

export const MODEL_PROVIDER_OPTIONS = [
  {
    value: "deepseek",
    label: "DeepSeek",
    api: "openai-completions",
    baseUrl: "https://api.deepseek.com/v1"
  },
  {
    value: "kimi-coding",
    label: "Kimi Coding",
    api: "anthropic-messages",
    baseUrl: "https://api.kimi.com/coding"
  },
  {
    value: "minimax-codeplan",
    label: "MiniMax Plan",
    api: "openai-completions",
    baseUrl: "https://api.minimaxi.com/v1"
  },
  {
    value: "xiaomi-token-plan-cn",
    get label() {
      return t("xiaomiMiMoTokenPlanChina");
    },
    api: "openai-responses",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/v1"
  },
  {
    value: "dashscope",
    get label() {
      return t("alibabaQwenAIPlatformBailian");
    },
    get description() {
      return t("payAsYouGoUsesAQwenAIPlatform");
    },
    api: "openai-completions",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  },
  {
    value: "qwen-token-plan",
    get label() {
      return t("alibabaQwenTokenPlan");
    },
    get description() {
      return t("chinaIndividualTeamPlansUseThePlanSAPI");
    },
    api: "openai-completions",
    baseUrl:
      "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
  },
  {
    value: "volcengine",
    get label() {
      return t("volcengineDoubao");
    },
    get description() {
      return t("payAsYouGoDirectAccessEnterAModel");
    },
    api: "openai-completions",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3"
  },
  {
    value: "volcengine-plan",
    get label() {
      return t("volcengineCodingPlan");
    },
    get description() {
      return t("planEndpointUseArkCodeLatestOrASupported");
    },
    api: "openai-completions",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3"
  },
  {
    value: "zai-coding-cn",
    get label() {
      return t("zAICodingPlan");
    },
    api: "openai-completions",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4"
  },
  {
    value: "zhipu",
    get label() {
      return t("zhipuGLMOpenPlatform");
    },
    api: "openai-completions",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4"
  },
  {
    value: "moonshot",
    get label() {
      return t("kimiOpenPlatform");
    },
    api: "openai-completions",
    baseUrl: "https://api.moonshot.cn/v1"
  },
  {
    value: "openai",
    label: "OpenAI",
    api: "openai-responses",
    baseUrl: "https://api.openai.com/v1"
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    get description() {
      return t("useAnOpenRouterAPIKeyModelIDsMustInclude");
    },
    api: "openai-completions",
    baseUrl: "https://openrouter.ai/api/v1"
  },
  {
    value: "opencode-go",
    label: "OpenCode Go",
    get description() {
      return t("goPlanWithAnOpenCodeAPIKeyChooseThe");
    },
    api: "openai-completions",
    baseUrl: "https://opencode.ai/zen/go/v1"
  },
  {
    value: "anthropic",
    label: "Anthropic",
    api: "anthropic-messages",
    baseUrl: "https://api.anthropic.com"
  },
  {
    value: "google",
    label: "Google",
    api: "google-generative-ai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta"
  },
  {
    value: "ollama",
    label: "Ollama",
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:11434/v1"
  },
  {
    value: "custom",
    get label() {
      return t("otherCompatibleService");
    }
  }
] as const satisfies ReadonlyArray<ModelProviderOption>;

export function applyProviderPresetDefaults(
  target: ModelProviderPresetTarget,
  provider: string
): void {
  target.provider = provider;
  const preset = MODEL_PROVIDER_OPTIONS.find(
    (option) => option.value === provider
  );
  if (preset && "api" in preset && "baseUrl" in preset) {
    target.api = preset.api;
    target.baseUrl = preset.baseUrl;
  }
}
