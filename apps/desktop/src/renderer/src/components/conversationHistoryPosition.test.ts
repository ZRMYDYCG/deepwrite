import { describe, expect, it } from "vitest";
import { conversationHistoryPosition } from "./conversationHistoryPosition";

describe("conversation history panel position", () => {
  it("keeps the full panel inside a narrow conversation pane", () => {
    expect(
      conversationHistoryPosition(
        { right: 390, bottom: 52 },
        { left: 56, right: 500, bottom: 540 },
        { width: 575, height: 540 }
      )
    ).toEqual({ left: 64, top: 60, width: 370, maxHeight: 472 });
  });

  it("shrinks to a narrow floating chat window and follows its bounds", () => {
    expect(
      conversationHistoryPosition(
        { right: 542, bottom: 158 },
        { left: 250, right: 550, bottom: 500 },
        { width: 575, height: 540 }
      )
    ).toEqual({ left: 258, top: 166, width: 284, maxHeight: 326 });
  });
});
