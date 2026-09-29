import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { i18nResourcesPlugin } from "../apps/desktop/scripts/i18n-resources";
import { messageCatalogKeys } from "../apps/desktop/src/localization/message-catalog";
import { messages } from "../apps/desktop/src/renderer/src/i18n/messages";

describe("language data assets", () => {
  it("emits exact catalogs as separate assets with a validated schema", async () => {
    const plugin = i18nResourcesPlugin(
      resolve("apps/desktop/src/renderer/src/i18n/messages")
    );
    const assets = [];
    const addWatchFile = vi.fn();
    const entry = plugin.resolveId("virtual:deepwrite-locale-resources");
    const source = await plugin.load.call(
      {
        addWatchFile,
        emitFile(asset) {
          assets.push(asset);
          return `locale${assets.length}`;
        }
      },
      entry
    );
    expect(assets).toHaveLength(2);
    for (const [index, language] of ["zh-CN", "en-US"].entries()) {
      const asset = assets[index];
      expect(asset.fileName).toBe(`locales/${language}.json`);
      expect(JSON.parse(asset.source)).toEqual(messages[language]);
      const signature = createHash("sha256")
        .update(messageCatalogKeys(messages[language]).join("\n"))
        .digest("hex");
      expect(source).toContain(signature);
      expect(source).toContain(
        `import.meta.ROLLUP_FILE_URL_locale${index + 1}`
      );
    }
    expect(source.length).toBeLessThan(500);
    expect(addWatchFile).toHaveBeenCalledWith(
      resolve("apps/desktop/src/renderer/src/i18n/messages/index.ts")
    );
  });

  it.each([{}, [], null, { foundation: {} }, { foundation: 2 }])(
    "rejects malformed resource trees: %j",
    (value) => {
      expect(() => messageCatalogKeys(value)).toThrow("malformed");
    }
  );
});
