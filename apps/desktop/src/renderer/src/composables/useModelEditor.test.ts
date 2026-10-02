import { effectScope } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { DraftModel } from "../components/modelSettingsDraft";
import { useModelEditor } from "./useModelEditor";

const model: DraftModel = {
  id: "model_writer",
  label: "Writer",
  provider: "custom",
  modelId: "writer-v1",
  api: "openai-completions",
  baseUrl: "https://example.test/v1",
  reasoning: false,
  defaultThinkingLevel: "off",
  thinkingLevelOptions: ["medium"],
  temperatureOptions: [0.1, 0.7, 1],
  hasApiKey: false
};

describe("custom model editor", () => {
  it("keeps a saved model's advanced capacity while editing other fields", () => {
    const scope = effectScope();
    const save = vi.fn();
    const test = vi.fn();
    const editor = scope.run(() =>
      useModelEditor(
        {
          ...model,
          originalId: model.id,
          contextWindow: 128_000,
          maxTokens: 8_000
        },
        { save, test }
      )
    )!;
    editor.editor.value.label = "Updated writer";

    editor.test();
    editor.save();

    expect(test).toHaveBeenCalledWith(
      expect.objectContaining({ contextWindow: 128_000, maxTokens: 8_000 })
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({
          label: "Updated writer",
          contextWindow: 128_000,
          maxTokens: 8_000
        })
      })
    );
    scope.stop();
  });
});
