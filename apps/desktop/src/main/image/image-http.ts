export type ImageFetcher = (
  url: string,
  init?: RequestInit
) => Promise<Response>;

export class SafeImageError extends Error {}

export function safeImageError(error: unknown): string {
  // Provider bodies, URLs, authorization headers and native network errors never cross IPC.
  return error instanceof SafeImageError
    ? error.message
    : "图片操作失败，请检查配置或稍后重试。";
}

export function abortImage(signal: AbortSignal): void {
  if (signal.aborted) throw new SafeImageError("图片生成已取消。");
}

export function imageDelay(ms: number, signal: AbortSignal): Promise<void> {
  abortImage(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new SafeImageError("图片生成已取消。"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function boundedResponse(
  response: Response,
  maximum: number,
  signal: AbortSignal
): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > maximum) {
    await response.body?.cancel().catch(() => undefined);
    throw new SafeImageError("图片或服务响应超过大小限制。");
  }
  if (!response.body) throw new SafeImageError("图片服务返回了空响应。");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      abortImage(signal);
      const chunk = await reader.read();
      abortImage(signal);
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > maximum)
        throw new SafeImageError("图片或服务响应超过大小限制。");
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks, length);
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function imageJson(
  url: string,
  init: RequestInit,
  fetcher: ImageFetcher,
  signal: AbortSignal
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    abortImage(signal);
    let response: Response;
    try {
      response = await fetcher(url, { ...init, redirect: "error", signal });
    } catch {
      abortImage(signal);
      throw new SafeImageError("图片服务连接失败，请检查接口地址和网络。");
    }
    if ((response.status === 429 || response.status >= 500) && attempt === 0) {
      await response.body?.cancel();
      await imageDelay(1_000, signal);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new SafeImageError(
        response.status === 401 || response.status === 403
          ? "图片服务授权失败，请检查 API Key。"
          : `图片服务请求失败（HTTP ${response.status}），请检查模型参数或稍后重试。`
      );
    }
    const buffer = await boundedResponse(response, 30 * 1024 * 1024, signal);
    try {
      const raw: unknown = JSON.parse(buffer.toString("utf8"));
      if (typeof raw === "object" && raw !== null && !Array.isArray(raw))
        return raw as Record<string, unknown>;
    } catch {
      /* Only safe local messages are surfaced. */
    }
    throw new SafeImageError("图片服务响应格式无效。");
  }
  throw new SafeImageError("图片服务请求失败。");
}
