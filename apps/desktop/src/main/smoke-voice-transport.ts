import type { VoiceServiceOptions } from "./voice/voice-service";

/** Isolated Electron smoke transport: never contacts a real speech provider. */
export function voiceSmokeOptions(): VoiceServiceOptions {
  return {
    secureStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`smoke-only:${value}`),
      decryptString: (value) => value.toString().replace(/^smoke-only:/u, "")
    },
    async fetcher(url, init) {
      if (new URL(url).hostname !== "voice.example.test")
        throw new Error("Voice smoke requires an isolated endpoint.");
      const body = JSON.parse(String(init?.body)) as { model: string };
      if (body.model === "smoke-ui-delay") {
        await new Promise<void>((resolve, reject) => {
          const finish = () => {
            init?.signal?.removeEventListener("abort", abort);
            resolve();
          };
          const timer = setTimeout(finish, 1_500);
          const abort = () => {
            clearTimeout(timer);
            reject(new Error("smoke aborted"));
          };
          if (init?.signal?.aborted) abort();
          else init?.signal?.addEventListener("abort", abort, { once: true });
        });
      }
      if (body.model === "smoke-slow") {
        await new Promise<void>((_resolve, reject) => {
          const abort = () => reject(new Error("smoke aborted"));
          if (init?.signal?.aborted) abort();
          else init?.signal?.addEventListener("abort", abort, { once: true });
        });
      }
      return new Response(
        JSON.stringify(
          url.endsWith("/chat/completions")
            ? {
                choices: [{ message: { content: "这是语音输入测试。" } }],
                usage: {
                  seconds: 1,
                  prompt_tokens: 8,
                  completion_tokens: 6,
                  total_tokens: 14
                }
              }
            : {
                output: { sentence: { text: "这是千问语音输入测试。" } },
                usage: { duration: 1 }
              }
        ),
        { headers: { "Content-Type": "application/json" } }
      );
    }
  };
}
