import { describe, expect, it } from "vitest";
import { createCatalogId, createId, deepFreeze, randomHex8 } from "./index";

describe("short random ids", () => {
  it("randomHex8 returns eight lowercase hex characters", () => {
    expect(randomHex8()).toMatch(/^[0-9a-f]{8}$/);
  });

  it("createId uses underscore and an eight-character suffix", () => {
    expect(createId("evt")).toMatch(/^evt_[0-9a-f]{8}$/);
  });

  it("createCatalogId uses hyphen and an eight-character suffix", () => {
    expect(createCatalogId("book")).toMatch(/^book-[0-9a-f]{8}$/);
  });
});

describe("deepFreeze", () => {
  it("freezes nested objects and arrays and returns the same value", () => {
    const value = { list: [{ text: "正文" }], nested: { count: 1 } };
    expect(deepFreeze(value)).toBe(value);
    expect(Object.isFrozen(value.list[0])).toBe(true);
    expect(() => value.list.push({ text: "新增" })).toThrow(TypeError);
    expect(() => {
      value.nested.count = 2;
    }).toThrow(TypeError);
  });

  it("leaves primitives and null untouched", () => {
    expect(deepFreeze(null)).toBeNull();
    expect(deepFreeze("正文")).toBe("正文");
  });
});
