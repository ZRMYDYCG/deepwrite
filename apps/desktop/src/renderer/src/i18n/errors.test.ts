import { afterEach, describe, expect, it } from "vitest";
import { formatError, getErrorCode, getErrorPayload } from "./errors";
import { setAppLanguage } from "./index";

afterEach(() => setAppLanguage("zh-CN", "zh-CN"));

describe("structured application errors", () => {
  it("localizes by stable code while preserving diagnostics and data", () => {
    const error = {
      code: "catalog.conflict",
      message: "original diagnostic",
      details: { expectedRevision: "before", actualRevision: "after" }
    };
    setAppLanguage("en-US", "zh-CN");
    expect(formatError(error, "Save failed")).toBe(
      "The local file changed elsewhere. Reload it and review your changes."
    );
    expect(getErrorCode(error)).toBe("catalog.conflict");
    expect(getErrorPayload(error)).toEqual(error);
    setAppLanguage("zh-CN", "en-US");
    expect(formatError(error, "保存失败")).toContain(
      "本地文件已在其他位置更新"
    );
  });

  it("uses the caller's translated fallback for unknown remote codes", () => {
    expect(
      formatError(
        { code: "unknown.failure", message: "diagnostic" },
        "Could not save"
      )
    ).toBe("Could not save");
    expect(formatError(new Error("local validation"), "Could not save")).toBe(
      "local validation"
    );
    expect(
      getErrorCode(new Error("catalog.conflict: arbitrary text"))
    ).toBeUndefined();
    expect(
      formatError(
        Object.assign(new Error("Pending review"), { code: "session_busy" }),
        "Could not delete"
      )
    ).toBe("Pending review");
    expect(getErrorCode({ code: "catalog.conflict" })).toBeUndefined();
  });
});
