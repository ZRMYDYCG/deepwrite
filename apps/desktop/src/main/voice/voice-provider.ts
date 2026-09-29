import {
  VOICE_MAX_DURATION_MS,
  type VoiceLanguage,
  type VoiceProfileId,
  type VoiceUsageRecord
} from "@deepwrite/contracts";

export type VoiceFetcher = (
  url: string,
  init?: RequestInit
) => Promise<Response>;

export interface VoiceProviderConfig {
  id: VoiceProfileId;
  baseUrl: string;
  model: string;
  apiKey: string;
  language: VoiceLanguage;
}

export interface VoiceRecognition {
  text: string;
  durationMs?: number;
  usage: Partial<
    Pick<VoiceUsageRecord, "inputTokens" | "outputTokens" | "totalTokens">
  >;
}

class VoiceProviderError extends Error {}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function tokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function providerRequest(config: VoiceProviderConfig, audioBase64: string) {
  const audio = {
    type: "input_audio",
    input_audio: { data: `data:audio/wav;base64,${audioBase64}` }
  };
  const messages = [{ role: "user", content: [audio] }];
  const base = config.baseUrl.replace(/\/+$/, "");
  if (config.id.startsWith("mimo-")) {
    return {
      url: `${base}/chat/completions`,
      headers: {},
      body: {
        model: config.model,
        messages,
        stream: false,
        asr_options: { language: config.language }
      }
    };
  }
  // Audio 3.x uses DashScope, not the older Qwen3 chat-completions payload.
  const dashscopeBase = base.replace(/\/(?:compatible-mode\/v1|api\/v1)$/, "");
  return {
    url: `${dashscopeBase}/api/v1/services/aigc/multimodal-generation/generation`,
    headers: { "X-DashScope-SSE": "disable" },
    body: {
      model: config.model,
      input: { messages },
      parameters: {
        format: "wav",
        sample_rate: "16000",
        ...(config.language === "auto"
          ? {}
          : { language_hints: [config.language] })
      }
    }
  };
}

function statusError(status: number): VoiceProviderError {
  if (status === 401 || status === 403) {
    return new VoiceProviderError(
      "语音服务鉴权失败，请检查 API Key 和接入方式。"
    );
  }
  if (status === 429) {
    return new VoiceProviderError(
      "语音服务额度不足或请求过于频繁，请稍后重试。"
    );
  }
  if (status === 400 || status === 404) {
    return new VoiceProviderError(
      "语音服务不接受当前配置，请检查模型和接口地址。"
    );
  }
  return new VoiceProviderError(
    `语音服务暂时不可用（HTTP ${status}），请稍后重试。`
  );
}

async function readResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new VoiceProviderError("语音服务没有返回识别结果。");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1_000_000) {
        await reader.cancel().catch(() => undefined);
        throw new VoiceProviderError("语音识别结果超过大小限制。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new VoiceProviderError("语音服务返回的结果格式无效。");
  }
}

function parseRecognition(data: unknown, isMimo: boolean): VoiceRecognition {
  const payload = record(data);
  if (payload.error || payload.code) {
    throw new VoiceProviderError("语音识别失败，请检查语音配置或稍后重试。");
  }
  const output = record(payload.output);
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const content = record(record(choices[0]).message).content;
  const text = isMimo
    ? content
    : (output.text ??
      record(output.sentence).text ??
      record(record(output.output).sentence).text);
  if (typeof text !== "string" || text.length > 100_000) {
    throw new VoiceProviderError("语音服务返回的识别文本无效。");
  }
  const usage = record(payload.usage);
  const inputTokens = tokenCount(
    isMimo ? usage.prompt_tokens : usage.input_tokens
  );
  const outputTokens = tokenCount(
    isMimo ? usage.completion_tokens : usage.output_tokens
  );
  const totalTokens = tokenCount(usage.total_tokens);
  const seconds = isMimo ? usage.seconds : usage.duration;
  const durationMs =
    typeof seconds === "number" &&
    Number.isFinite(seconds) &&
    seconds >= 0 &&
    seconds * 1_000 <= VOICE_MAX_DURATION_MS + 1_000
      ? Math.ceil(seconds * 1_000)
      : undefined;
  return {
    text: text.trim(),
    ...(durationMs === undefined ? {} : { durationMs }),
    usage: {
      ...(inputTokens === undefined ? {} : { inputTokens }),
      ...(outputTokens === undefined ? {} : { outputTokens }),
      ...(totalTokens === undefined ? {} : { totalTokens })
    }
  };
}

export async function recognizeVoice(
  config: VoiceProviderConfig,
  audioBase64: string,
  fetcher: VoiceFetcher,
  signal: AbortSignal
): Promise<VoiceRecognition> {
  try {
    const request = providerRequest(config, audioBase64);
    const response = await fetcher(request.url, {
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...request.headers
      },
      body: JSON.stringify(request.body)
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw statusError(response.status);
    }
    return parseRecognition(
      await readResponse(response),
      config.id.startsWith("mimo-")
    );
  } catch (error) {
    if (error instanceof VoiceProviderError) throw error;
    // Provider bodies, URLs and transport errors can contain credentials.
    throw new VoiceProviderError(
      "无法连接语音服务，请检查网络和接口配置后重试。"
    );
  }
}
