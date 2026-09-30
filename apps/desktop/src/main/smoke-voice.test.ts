import { afterEach, expect, it, vi } from "vitest";
import { voiceSmokeInRenderer } from "./smoke-voice";

afterEach(() => vi.unstubAllGlobals());

it("repeats voice smoke against the same profile without reusing request IDs", async () => {
  const profileIds = ["mimo-api", "doubao-api", "qwen-api", "openai-api"];
  let settings = {
    profiles: profileIds.map((id) => ({
      id,
      model: "smoke-normal",
      baseUrl: "https://voice.example.test/v1",
      hasApiKey: false
    }))
  };
  const usage = Array.from({ length: 8 }, (_, index) => ({
    requestId: `previous_${index}`,
    totalTokens: undefined as number | undefined
  }));
  const requests: string[] = [];
  const pending = new Map<string, (error: Error) => void>();
  vi.stubGlobal("deepwrite", {
    modelUsage: { query: async () => ({ totals: { inputTokens: 0 } }) },
    voice: {
      getSettings: async () => structuredClone(settings),
      saveSettings: async (input: {
        profiles: Array<
          (typeof settings.profiles)[number] & { apiKey?: string }
        >;
      }) => {
        settings = {
          profiles: input.profiles.map(({ apiKey: _apiKey, ...profile }) => ({
            ...profile,
            hasApiKey: true
          }))
        };
        return structuredClone(settings);
      },
      getUsage: async () => structuredClone(usage),
      transcribe: async (input: { requestId: string; profileId: string }) => {
        if (requests.includes(input.requestId))
          throw new Error("duplicate voice request ID");
        requests.push(input.requestId);
        if (
          settings.profiles.find((profile) => profile.id === input.profileId)
            ?.model === "smoke-slow"
        ) {
          return new Promise<never>((_, reject) => {
            pending.set(input.requestId, reject);
          });
        }
        usage.push({
          requestId: input.requestId,
          totalTokens: ["mimo-api", "qwen-api"].includes(input.profileId)
            ? 10
            : undefined
        });
        usage.splice(0, Math.max(0, usage.length - 10));
        return { text: "语音输入测试" };
      },
      cancel: async ({ requestId }: { requestId: string }) => {
        pending.get(requestId)?.(new Error("voice request canceled"));
      }
    }
  });

  await expect(voiceSmokeInRenderer()).resolves.toMatchObject({
    status: "ok",
    profiles: 4
  });
  await expect(voiceSmokeInRenderer()).resolves.toMatchObject({
    status: "ok",
    profiles: 4
  });
  expect(requests).toHaveLength(10);
  expect(new Set(requests).size).toBe(requests.length);
  expect(usage).toHaveLength(10);
});
