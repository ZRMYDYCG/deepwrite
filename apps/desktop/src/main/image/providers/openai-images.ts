import {
  IMAGE_MODEL_PRESETS,
  imageModelAspectRatios,
  type CoverAspectRatio,
  type ImageModelProfile
} from "@deepwrite/contracts";
import { imageJson, SafeImageError, type ImageFetcher } from "../image-http";

export type ImageSource = { base64: string } | { url: string };
export interface ImageGeneration {
  profile: ImageModelProfile & { apiKey: string };
  prompt: string;
  negativePrompt?: string;
  aspectRatio: CoverAspectRatio;
  images: number;
}

export function extractImageSources(
  raw: Record<string, unknown>
): ImageSource[] {
  const values = Array.isArray(raw.data)
    ? raw.data
    : Array.isArray(raw.images)
      ? raw.images
      : [];
  return values.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null)
      throw new SafeImageError("图片服务返回了无效图片。");
    if (
      "b64_json" in entry &&
      typeof entry.b64_json === "string" &&
      entry.b64_json.length
    )
      return { base64: entry.b64_json };
    if ("url" in entry && typeof entry.url === "string" && entry.url.length)
      return { url: entry.url };
    throw new SafeImageError("图片服务返回了无效图片。");
  });
}

export function openAiImageBody(
  input: ImageGeneration
): Record<string, unknown> {
  const preset = IMAGE_MODEL_PRESETS[input.profile.presetId];
  const size = imageModelAspectRatios(
    input.profile.presetId,
    input.profile.model
  )[input.aspectRatio];
  if (!size) throw new SafeImageError("当前图片模型不支持所选比例。");
  const body: Record<string, unknown> = {
    model: input.profile.model,
    prompt: input.prompt
  };
  if (preset.variant === "siliconflow") {
    body.image_size = size;
    body.batch_size = input.images;
  } else {
    body.size = size;
    if (preset.variant === "volcengine") {
      body.sequential_image_generation = "disabled";
      body.response_format = "b64_json";
    } else if (preset.variant === "openai") {
      body.n = input.images;
      // GPT Image always returns base64; response_format applies to DALL-E and gateways.
      if (!input.profile.model.startsWith("gpt-image"))
        body.response_format = "b64_json";
    }
  }
  if (preset.supportsNegativePrompt && input.negativePrompt)
    body.negative_prompt = input.negativePrompt;
  if (preset.supportsWatermark && input.profile.watermark !== undefined)
    body[preset.variant === "zhipu" ? "watermark_enabled" : "watermark"] =
      input.profile.watermark;
  if (preset.supportsQuality && input.profile.quality) {
    body.quality =
      preset.variant === "zhipu" && input.profile.quality === "high"
        ? "hd"
        : preset.variant === "openai" &&
            input.profile.model.startsWith("gpt-image") &&
            input.profile.quality === "standard"
          ? "medium"
          : input.profile.quality;
  }
  return body;
}

export async function generateOpenAiImages(
  input: ImageGeneration,
  fetcher: ImageFetcher,
  signal: AbortSignal
): Promise<ImageSource[]> {
  const raw = await imageJson(
    `${input.profile.baseUrl.replace(/\/$/u, "")}/images/generations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.profile.apiKey}`
      },
      body: JSON.stringify(openAiImageBody(input))
    },
    fetcher,
    signal
  );
  const sources = extractImageSources(raw);
  if (sources.length !== input.images)
    throw new SafeImageError("图片服务返回的张数与请求不一致。");
  return sources;
}
