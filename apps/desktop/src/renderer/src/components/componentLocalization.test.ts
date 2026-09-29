import { afterEach, describe, expect, it } from "vitest";
import { computed } from "vue";
import { locale, setAppLanguage, t } from "../i18n";
import {
  genreLabel,
  documentFormatLabel,
  builtinFontLabel
} from "./catalogLabels";
import { BUILT_IN_THINKING_LABELS } from "./agentTeamSettingsMeta";
import { MODEL_PROVIDER_OPTIONS } from "./modelProviderPresets";
import { metadataEditFailureMessage } from "./metadataEditMessages";
import { plotStageLabel } from "../i18n/plotStageLabels";
import { toolActivityLabel } from "./conversationActivityLabel";

const originalLocale = locale.value;
afterEach(() => {
  locale.value = originalLocale;
});

describe("component language presentation", () => {
  it("updates existing option objects and computed labels in both directions", () => {
    setAppLanguage("zh-CN", "en-US");
    const provider = MODEL_PROVIDER_OPTIONS.find(
      (option) => option.value === "dashscope"
    )!;
    const label = computed(
      () => `${provider.label} / ${BUILT_IN_THINKING_LABELS.high}`
    );
    expect(label.value).toBe("阿里千问AI平台（百炼） / 深度");
    setAppLanguage("en-US", "zh-CN");
    expect(label.value).toBe("Alibaba Qwen AI Platform (Bailian) / High");
    expect(provider.value).toBe("dashscope");
    setAppLanguage("zh-CN", "en-US");
    expect(label.value).toBe("阿里千问AI平台（百炼） / 深度");
  });

  it("translates contract-backed labels while preserving custom content", () => {
    setAppLanguage("en-US", "zh-CN");
    expect(genreLabel("世情")).toBe("Social fiction");
    expect(plotStageLabel({ id: "worldbuilding", title: "世界观" })).toBe(
      "Worldbuilding"
    );
    expect(plotStageLabel({ id: "worldbuilding", title: "自定义背景" })).toBe(
      "自定义背景"
    );
    expect(
      plotStageLabel({ id: "custom_worldbuilding", title: "世界观" })
    ).toBe("世界观");
    expect(documentFormatLabel("正文")).toBe("Manuscript");
    expect(builtinFontLabel("system", "系统默认")).toBe("System default");
    expect(genreLabel("我的自定义题材")).toBe("我的自定义题材");
    expect(builtinFontLabel("font_custom", "我的字体")).toBe("我的字体");
  });

  it("formats live activity and interpolated messages using the active language", () => {
    setAppLanguage("en-US", "zh-CN");
    expect(toolActivityLabel("read_file")).toBe("Read file");
    const failure = {
      updated: false,
      code: "missing_skill_fields",
      message: "Legacy fallback"
    } as const;
    expect(metadataEditFailureMessage(failure)).toBe(
      "Enter a skill name and usage notes."
    );
    expect(
      t("components.agentEditProposalCard.valueLinesAddedValueLinesRemoved", {
        arg0: 2,
        arg1: 1
      })
    ).toBe("Lines added: 2; lines removed: 1");
    setAppLanguage("zh-CN", "en-US");
    expect(toolActivityLabel("read_file")).toBe("读取文件");
    expect(metadataEditFailureMessage(failure)).toBe(
      "请填写技能名称和使用说明。"
    );
  });
});
