import { describe, expect, it } from "vitest";
import source from "./OfficialModelsPanel.vue?raw";

describe("OfficialModelsPanel", () => {
  it("opens the official model shop in the system browser", () => {
    expect(source).toMatch(/href="https:\/\/[^/]+\/shop\/[A-Za-z0-9]+"/);
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).toContain("store");
  });

  it("adds one protected token and presents local usage with remote consumption", () => {
    expect(source).toContain("addYourOfficialToken");
    expect(source).toContain('type="password"');
    expect(source).toContain('autocomplete="new-password"');
    expect(source).toContain('emit("saveToken", apiKey)');
    expect(source).toContain("tokensUsedOnThisDevice");
    expect(source).toContain("currentKeySpending");
    expect(source).toContain("currentKeyRemainingYuan");
    expect(source).toContain("currentKeyUsedYuan");
    expect(source).toContain("currentKeyGrantedYuan");
    expect(source).toContain('role="progressbar"');
    expect(source).not.toContain("accountBalanceYuan");
    expect(source).not.toContain("keyQuotaRemainingYuan");
    expect(source).not.toContain("默认额度");
    expect(source).toContain(
      "valueOfficialModelsEnabledTheTokenIsNeverReturned"
    );
    expect(source).toContain("emit('load')");
  });

  it("shows total, input, output, and cache use for every official model", () => {
    expect(source).toContain("supportedModels");
    expect(source).toContain("totalUsage");
    expect(source).toContain("input");
    expect(source).toContain("output");
    expect(source).toContain("cache");
    expect(source).toContain("discount");
    expect(source).toContain("price");
    expect(source).toContain("formatDiscount");
    expect(source).toContain("cNYMillionTokens");
    expect(source).toContain("row.model.status");
    expect(source).toContain("unavailable");
    expect(source).toContain("enable");
    expect(source).toContain('role="switch"');
    expect(source).toContain("deepwriteOfficialEnabledModelIds");
    expect(source).toContain("setModelEnabled");
    expect(source).toContain("cacheReadTokens");
    expect(source).toContain("cacheWriteTokens");
    expect(source).toContain("deviceTokenCountsComeFromTheLocalLedger");
    expect(source).not.toContain("quotaExhausted");
  });
});
