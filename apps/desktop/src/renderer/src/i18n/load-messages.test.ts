import { afterEach, describe, expect, it, vi } from "vitest";
import { messageCatalogKeys } from "../../../localization/message-catalog";
import { messages } from "./messages";
import { loadMessageCatalogs } from "./load-messages";
import { i18n, setAppLanguage, t } from "./index";

vi.mock("virtual:deepwrite-locale-resources", async () => ({
  default: Object.fromEntries(
    await Promise.all(
      ["zh-CN", "en-US"].map(async (locale) => {
        const shape = new TextEncoder().encode(
          messageCatalogKeys(messages[locale as "zh-CN" | "en-US"]).join("\n")
        );
        const digest = await crypto.subtle.digest("SHA-256", shape);
        return [
          locale,
          {
            url: `file:///application/locales/${locale}.json`,
            schema: [...new Uint8Array(digest)]
              .map((byte) => byte.toString(16).padStart(2, "0"))
              .join("")
          }
        ];
      })
    )
  )
}));

type Response = { status: number; response: unknown } | "network" | "timeout";
const requests: FakeRequest[] = [];
class FakeRequest {
  url = "";
  status = 0;
  response: unknown;
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  open(_method: string, url: string): void {
    this.url = url;
  }
  send(): void {
    requests.push(this);
  }
  finish(result: Response): void {
    if (result === "network") this.onerror?.();
    else if (result === "timeout") this.ontimeout?.();
    else {
      this.status = result.status;
      this.response = result.response;
      this.onload?.();
    }
  }
}
function startLoad(): Promise<void> {
  vi.stubGlobal("XMLHttpRequest", FakeRequest);
  return loadMessageCatalogs();
}
function finishRequest(index: number, result: Response): void {
  requests[index]!.finish(result);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  requests.length = 0;
  setAppLanguage("zh-CN", "zh-CN");
});

describe("language resource loading", () => {
  it("awaits both catalogs and supports packaged file responses before registration", async () => {
    const register = vi.spyOn(i18n.global, "setLocaleMessage");
    const loading = startLoad();
    expect(requests.map((request) => request.url)).toEqual([
      "file:///application/locales/zh-CN.json",
      "file:///application/locales/en-US.json"
    ]);
    finishRequest(0, { status: 0, response: messages["zh-CN"] });
    await Promise.resolve();
    expect(register).not.toHaveBeenCalled();
    finishRequest(1, { status: 0, response: messages["en-US"] });
    await loading;
    expect(register).toHaveBeenCalledTimes(2);
    setAppLanguage("en-US", "zh-CN");
    expect(t("foundation.language")).toBe("Language");
  });

  it.each(["network", "timeout"] as const)(
    "rejects %s failures without registering partial catalogs",
    async (failure) => {
      const register = vi.spyOn(i18n.global, "setLocaleMessage");
      const loading = startLoad();
      const rejected = expect(loading).rejects.toThrow("resources");
      finishRequest(0, { status: 200, response: messages["zh-CN"] });
      finishRequest(1, failure);
      await rejected;
      expect(register).not.toHaveBeenCalled();
    }
  );

  it.each([{}, [], { foundation: { language: "Language" } }])(
    "rejects malformed or incomplete catalogs before registration: %j",
    async (response) => {
      const register = vi.spyOn(i18n.global, "setLocaleMessage");
      const loading = startLoad();
      const rejected = expect(loading).rejects.toThrow("catalog");
      finishRequest(0, { status: 200, response: messages["zh-CN"] });
      finishRequest(1, { status: 200, response });
      await rejected;
      expect(register).not.toHaveBeenCalled();
    }
  );
});
