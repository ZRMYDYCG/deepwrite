import { describe, expect, it, vi } from "vitest";
import { useEditorComposition } from "./useEditorComposition";

describe("editor composition boundary", () => {
  it("leaves successive native candidates intact across unrelated renders", () => {
    const composition = useEditorComposition();
    const input = { value: "原文n" } as HTMLTextAreaElement;
    composition.start();
    expect(composition.valueForRender("原文", input)).toBe("原文n");
    input.value = "原文ni";
    expect(composition.valueForRender("原文", input)).toBe("原文ni");
    composition.finish(() => {});
    expect(composition.valueForRender("原文你", input)).toBe("原文你");
  });

  it("publishes committed text before allowing persistence to resume", () => {
    let committed = "原文";
    const resumed = vi.fn();
    const composition = useEditorComposition({
      onChange(composing) {
        if (!composing) resumed(committed);
      }
    });
    composition.start();
    composition.finish(() => {
      committed = "原文你好";
    });
    expect(resumed).toHaveBeenCalledExactlyOnceWith("原文你好");
  });

  it("also pauses for an input marked as composing without a start event", () => {
    const changed = vi.fn();
    const composition = useEditorComposition({ onChange: changed });
    expect(
      composition.isComposingInput({ isComposing: true } as unknown as Event)
    ).toBe(true);
    expect(
      composition.isComposingInput({ isComposing: false } as unknown as Event)
    ).toBe(true);
    composition.finish(() => {});
    expect(composition.isComposingInput({} as Event)).toBe(false);
    expect(changed.mock.calls).toEqual([[true], [false]]);
  });

  it("releases a paused document on reset without committing its candidate", () => {
    const changed = vi.fn();
    const composition = useEditorComposition({ onChange: changed });
    composition.start();
    composition.reset();
    composition.reset();
    expect(composition.isComposing.value).toBe(false);
    expect(changed.mock.calls).toEqual([[true], [false]]);
  });

  it("ignores a late compositionend after switching away from its document", () => {
    const commit = vi.fn();
    const composition = useEditorComposition();
    composition.start();
    composition.reset();
    composition.finish(commit);
    expect(commit).not.toHaveBeenCalled();
  });
});
