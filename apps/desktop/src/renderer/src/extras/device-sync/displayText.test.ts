import { afterEach, describe, expect, it } from "vitest";
import { syncIssueSchema } from "@deepwrite/contracts/renderer";
import {
  syncIssueMessage,
  syncProgressTitle
} from "../../../../localization/sync-display-text";
import { setAppLanguage } from "../../i18n";
import {
  syncIssueText,
  syncIssueTitle,
  syncProgressText,
  syncText
} from "./displayText";

afterEach(() => setAppLanguage("zh-CN", "zh-CN"));

describe("sync status language across IPC", () => {
  it("renders a cached progress descriptor in either language without translating user titles", () => {
    const progress = {
      phase: "transferring" as const,
      completed: 1,
      total: 2,
      ...syncProgressTitle("uploading", { title: "我的作品 / My work" })
    };
    const snapshot = JSON.stringify(progress);
    expect(syncProgressText(progress)).toBe("上传到远端：我的作品 / My work");
    setAppLanguage("en-US", "zh-CN");
    expect(syncProgressText(progress)).toBe("Uploading: 我的作品 / My work");
    expect(JSON.stringify(progress)).toBe(snapshot);
    setAppLanguage("zh-CN", "en-US");
    expect(syncProgressText(progress)).toBe("上传到远端：我的作品 / My work");
  });

  it("validates and preserves detailed issue parameters through serialization", () => {
    const issue = syncIssueSchema.parse(
      JSON.parse(
        JSON.stringify({
          key: "material:test",
          title: "自定义名称",
          token: "",
          reason: "unsupported",
          ...syncIssueMessage("referencedResource", {
            sources: "「我的小说」"
          }),
          paths: [],
          local: null,
          versions: []
        })
      )
    );
    setAppLanguage("en-US", "en-US");
    expect(syncIssueTitle(issue)).toBe("自定义名称");
    expect(syncIssueText(issue)).toContain("still referenced by 「我的小说」");
    expect(syncIssueText(issue)).toContain("confirm deletion");
  });

  it("localizes recorded history descriptors without changing device names", () => {
    const entry = {
      code: "receivedChanges",
      params: { device: "写作电脑" }
    } as const;
    setAppLanguage("en-US", "en-US");
    expect(syncText(entry)).toBe("Changes received from 写作电脑");
  });
});
