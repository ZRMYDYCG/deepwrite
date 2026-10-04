import { IMAGE_MODEL_PRESETS } from "@deepwrite/contracts";
import {
  abortImage,
  imageDelay,
  imageJson,
  SafeImageError,
  type ImageFetcher
} from "../image-http";
import {
  extractImageSources,
  type ImageGeneration,
  type ImageSource
} from "./openai-images";

function output(raw: Record<string, unknown>): Record<string, unknown> {
  if (
    typeof raw.output !== "object" ||
    raw.output === null ||
    Array.isArray(raw.output)
  )
    throw new SafeImageError("图片服务任务响应无效。");
  return raw.output as Record<string, unknown>;
}

export async function generateDashscopeImages(
  input: ImageGeneration,
  fetcher: ImageFetcher,
  signal: AbortSignal,
  pollIntervalMs = 2_000
): Promise<ImageSource[]> {
  const preset = IMAGE_MODEL_PRESETS[input.profile.presetId];
  const size = preset.aspectRatios[input.aspectRatio];
  if (!size) throw new SafeImageError("当前图片模型不支持所选比例。");
  const root = input.profile.baseUrl
    .replace(/\/$/u, "")
    .replace(/\/api\/v1$/u, "");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${input.profile.apiKey}`
  };
  const submitted = output(
    await imageJson(
      `${root}/api/v1/services/aigc/text2image/image-synthesis`,
      {
        method: "POST",
        headers: { ...headers, "X-DashScope-Async": "enable" },
        body: JSON.stringify({
          model: input.profile.model,
          input: { prompt: input.prompt },
          parameters: {
            size: size.replace("x", "*"),
            n: input.images,
            ...(input.negativePrompt && preset.supportsNegativePrompt
              ? { negative_prompt: input.negativePrompt }
              : {}),
            ...(input.profile.watermark !== undefined &&
            preset.supportsWatermark
              ? { watermark: input.profile.watermark }
              : {})
          }
        })
      },
      fetcher,
      signal
    )
  );
  if (
    typeof submitted.task_id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,200}$/u.test(submitted.task_id)
  )
    throw new SafeImageError("图片服务未返回有效任务 ID。");
  while (true) {
    await imageDelay(pollIntervalMs, signal);
    abortImage(signal);
    const task = output(
      await imageJson(
        `${root}/api/v1/tasks/${submitted.task_id}`,
        { method: "GET", headers },
        fetcher,
        signal
      )
    );
    if (task.task_status === "SUCCEEDED") {
      const images = extractImageSources({ images: task.results });
      if (images.length !== input.images)
        throw new SafeImageError("图片服务返回的张数与请求不一致。");
      return images;
    }
    if (task.task_status !== "PENDING" && task.task_status !== "RUNNING")
      throw new SafeImageError(
        "图片服务任务失败或已取消，请调整提示词后重试。"
      );
  }
}
