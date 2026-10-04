import { reactive } from "vue";
import { expect, it, vi } from "vitest";
import type { DeepWriteApi, ModelConfig } from "@deepwrite/contracts/renderer";
import { createDecompositionModelCapacities } from "./model-capacity";

const model: ModelConfig = {
  id: "model_capacity",
  label: "标准模型",
  provider: "test-provider",
  modelId: "standard",
  api: "openai-completions",
  baseUrl: "https://example.test/v1",
  hasApiKey: true,
  reasoning: false,
  defaultThinkingLevel: "off",
  thinkingLevelOptions: ["low"],
  temperatureOptions: [0.1, 0.7, 1]
};

it("合并相同容量查询，缓存按模型配置失效，响应式参数可跨进程复制", async () => {
  const resolveCapacity = vi.fn(async (input) => {
    structuredClone(input);
    expect(input).not.toHaveProperty("hasApiKey");
    return { modelId: input.id, contextWindow: 128_000, maxTokens: 8192 };
  });
  const capacities = createDecompositionModelCapacities(
    () => ({ models: { resolveCapacity } }) as unknown as DeepWriteApi
  );
  const configured = reactive({ ...model });
  expect(capacities.peek(configured)).toBeUndefined();
  await Promise.all([
    capacities.resolve(configured),
    capacities.resolve(configured)
  ]);
  expect(resolveCapacity).toHaveBeenCalledTimes(1);
  expect(capacities.peek(configured)?.contextWindow).toBe(128_000);
  await capacities.resolve(configured);
  expect(resolveCapacity).toHaveBeenCalledTimes(1);
  configured.modelId = "other-model";
  expect(capacities.peek(configured)).toBeUndefined();
  await capacities.resolve(configured);
  expect(resolveCapacity).toHaveBeenCalledTimes(2);
  capacities.dispose();
});

it("查询失败可重试，显式自定义容量保持用户配置", async () => {
  const resolveCapacity = vi
    .fn()
    .mockRejectedValueOnce(new Error("目录不可用"))
    .mockResolvedValue({
      modelId: model.id,
      contextWindow: 32_000,
      maxTokens: 4096
    });
  const capacities = createDecompositionModelCapacities(
    () => ({ models: { resolveCapacity } }) as unknown as DeepWriteApi
  );
  await expect(capacities.resolve(model)).rejects.toThrow("目录不可用");
  expect((await capacities.resolve(model)).contextWindow).toBe(32_000);
  const custom = { ...model, contextWindow: 64_000, maxTokens: 2048 };
  expect(await capacities.resolve(custom)).toEqual({
    modelId: model.id,
    contextWindow: 64_000,
    maxTokens: 2048
  });
  expect(resolveCapacity).toHaveBeenCalledTimes(2);
  capacities.dispose();
});
