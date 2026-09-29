import { describe, expect, it } from "vitest";
// @ts-expect-error Loaded as source text by the Vitest-only virtual module.
import rendererStyles from "virtual:deepwrite-renderer-styles";
import conversationSource from "./AgentConversation.vue?raw";
import composerSource from "./ConversationComposer.vue?raw";
import modelConfigSource from "./ConversationModelConfigSelect.vue?raw";
import indicatorSource from "./ContextWindowIndicator.vue?raw";
import chatAssistantComposerSource from "../features/chat-assistant/ChatAssistantComposer.vue?raw";

describe("ContextWindowIndicator", () => {
  it("places the indicator after the unified model configuration", () => {
    const modelConfig = composerSource.indexOf(
      "<ConversationModelConfigSelect"
    );
    const indicator = composerSource.indexOf("<ContextWindowIndicator");

    expect(modelConfig).toBeGreaterThan(-1);
    expect(indicator).toBeGreaterThan(modelConfig);
    expect(modelConfigSource).toContain("reasoningLevel");
    expect(modelConfigSource).toContain("temperature");
    expect(composerSource).not.toContain('accessible-label="选择温度"');
  });

  it("is limited to the shared creative composer", () => {
    expect(conversationSource).toContain("<ConversationComposer");
    expect(composerSource).toContain("<ContextWindowIndicator");
    expect(composerSource).toContain(
      'v-if="settingsStore.generalSettings.showContextUsage"'
    );
    expect(chatAssistantComposerSource).not.toContain("ContextWindowIndicator");
  });

  it("teleports a keyboard-accessible tooltip outside the clipped composer", () => {
    expect(indicatorSource).toContain('<Teleport to="body">');
    expect(indicatorSource).toContain('role="tooltip"');
    expect(indicatorSource).toContain('@focus="focused = true"');
    expect(indicatorSource).toContain('@keydown.esc.prevent="closeTooltip"');
    expect(indicatorSource).toContain("getBoundingClientRect()");
    expect(indicatorSource).toContain("window.innerWidth");
    expect(rendererStyles).toContain("position: fixed;");
  });

  it("uses theme variables and preserves the compact toolbar footprint", () => {
    expect(rendererStyles).toContain("var(--surface-raised");
    expect(rendererStyles).toContain("var(--theme-line");
    expect(rendererStyles).toContain("var(--text-primary");
    expect(rendererStyles).toContain("var(--accent");
    expect(rendererStyles).toContain("flex: 0 0 auto;");
    expect(rendererStyles).toContain("width: 14px;");
    expect(rendererStyles).toContain("fill: none;");
    expect(rendererStyles).not.toContain("stroke-dasharray: 2 3;");
    expect(rendererStyles).toContain("prefers-reduced-motion: reduce");
  });

  it("shows actual percentages, exact tokens, and explicit unmeasured states", () => {
    expect(indicatorSource).toContain("usedValueValueRemaining");
    expect(indicatorSource).toContain("awaitingActualUsage");
    expect(indicatorSource).toContain("contextLimitUnavailable");
    expect(indicatorSource).toContain("tokens`");
    expect(indicatorSource).toContain(':stroke-dashoffset="dashOffset"');
    expect(indicatorSource).toContain('<svg viewBox="0 0 16 16"');
  });
});
