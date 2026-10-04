import { describe, expect, it } from "vitest";
import {
  scrollSelectedIntoView,
  type ScrollableMenu
} from "./scrollSelectedIntoView";

function element(init: {
  top: number;
  height: number;
  clientHeight?: number;
  scrollHeight?: number;
  scrollTop?: number;
  containsSelected?: boolean;
}): ScrollableMenu {
  return {
    getBoundingClientRect: () => ({
      top: init.top,
      height: init.height
    }),
    clientHeight: init.clientHeight ?? init.height,
    scrollHeight: init.scrollHeight ?? init.height,
    scrollTop: init.scrollTop ?? 0,
    contains: () => init.containsSelected !== false
  };
}

describe("scrollSelectedIntoView", () => {
  it("centers the selected option inside the overflow menu", () => {
    const scroller = element({
      top: 100,
      height: 200,
      clientHeight: 200,
      scrollHeight: 800,
      scrollTop: 0
    });
    const selected = element({ top: 620, height: 40 });

    scrollSelectedIntoView(scroller, selected);

    expect(scroller.scrollTop).toBe(440);
  });

  it("clamps to the available scroll range", () => {
    const scroller = element({
      top: 80,
      height: 180,
      clientHeight: 180,
      scrollHeight: 240,
      scrollTop: 0
    });
    const selected = element({ top: 260, height: 40 });

    scrollSelectedIntoView(scroller, selected);

    expect(scroller.scrollTop).toBe(60);
  });

  it("does not move a menu that is not overflowed", () => {
    const scroller = element({
      top: 40,
      height: 320,
      clientHeight: 320,
      scrollHeight: 280,
      scrollTop: 12
    });
    const selected = element({ top: 180, height: 40 });

    scrollSelectedIntoView(scroller, selected);

    expect(scroller.scrollTop).toBe(0);
  });

  it("ignores a selection that is not inside the menu", () => {
    const scroller = element({
      top: 0,
      height: 200,
      clientHeight: 200,
      scrollHeight: 800,
      containsSelected: false
    });
    const selected = element({ top: 400, height: 40 });

    scrollSelectedIntoView(scroller, selected);

    expect(scroller.scrollTop).toBe(0);
  });

  it.each([
    { top: 100, height: 40 },
    { top: 120, height: 40 },
    { top: 260, height: 40 },
    { top: 80, height: 240 }
  ])("keeps an already visible selection still in nearest mode: %o", (row) => {
    const scroller = element({
      top: 100,
      height: 200,
      scrollHeight: 800,
      scrollTop: 200
    });

    scrollSelectedIntoView(scroller, element(row), { block: "nearest" });

    expect(scroller.scrollTop).toBe(200);
  });

  it.each([
    { top: 80, height: 40, expected: 180 },
    { top: 280, height: 40, expected: 220 },
    { top: -100, height: 40, expected: 0 },
    { top: 620, height: 40, expected: 560 },
    { top: 300, height: 40, expected: 240 }
  ])("reveals only the hidden edge in nearest mode: %o", (row) => {
    const scroller = element({
      top: 100,
      height: 200,
      scrollHeight: 800,
      scrollTop: 200
    });

    scrollSelectedIntoView(scroller, element(row), { block: "nearest" });

    expect(scroller.scrollTop).toBe(row.expected);
  });

  it("clamps a nearest reveal to the available scroll range", () => {
    const scroller = element({
      top: 100,
      height: 200,
      scrollHeight: 400,
      scrollTop: 180
    });

    scrollSelectedIntoView(scroller, element({ top: 280, height: 80 }), {
      block: "nearest"
    });

    expect(scroller.scrollTop).toBe(200);
  });
});
