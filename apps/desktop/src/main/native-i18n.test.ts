import { afterEach, describe, expect, it } from "vitest";
import { nativeMessages, nativeText, setNativeLanguage } from "./native-i18n";
import zh from "./native-messages/zh-CN";
import en from "./native-messages/en-US";

afterEach(() => setNativeLanguage("zh-CN", "zh-CN"));

describe("native application language", () => {
  it("keeps every native label translated in both languages", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });

  it("updates future native menus and dialogs without altering user content", () => {
    expect(nativeText("copy")).toBe("复制");
    setNativeLanguage("en-US", "zh-CN");
    expect(nativeText("copy")).toBe("Copy");
    expect(nativeText("showApp")).toBe("Show DeepWrite");
    expect(nativeMessages().downloadTeam("用户名称")).toBe(
      "Download Agent Team “用户名称”"
    );
    expect(
      nativeMessages().migrationDetails("/source", "/target", true, false)
    ).toContain("sibling backup folder");
    expect(
      nativeMessages().migrationDetails("/source", "/target", false, true)
    ).toContain("subfolder shown above will be created");
    setNativeLanguage("auto", "zh-Hant");
    expect(nativeText("copy")).toBe("复制");
  });
});
