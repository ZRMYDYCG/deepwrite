import { nativeImage, type NativeImage } from "electron";
import {
  abortImage,
  boundedResponse,
  SafeImageError,
  type ImageFetcher
} from "./image-http";
import type { ImageSource } from "./providers/openai-images";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function identifyImage(
  buffer: Buffer
): "image/png" | "image/jpeg" | "image/webp" {
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES)
    throw new SafeImageError("单张图片不得超过 20 MB。");
  if (buffer.subarray(0, 8).equals(PNG_HEADER)) return "image/png";
  if (
    buffer.length >= 3 &&
    buffer[0] === 255 &&
    buffer[1] === 216 &&
    buffer[2] === 255
  )
    return "image/jpeg";
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  throw new SafeImageError("图片格式不支持，请选择 PNG、JPEG 或 WebP 输出。");
}

function httpsImageUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SafeImageError("图片下载地址无效。");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new SafeImageError("图片下载仅允许 HTTPS 地址。");
  return url;
}

export async function downloadImage(
  source: ImageSource,
  fetcher: ImageFetcher,
  signal: AbortSignal
): Promise<Buffer> {
  abortImage(signal);
  if ("base64" in source) {
    if (
      source.base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/u.test(source.base64)
    )
      throw new SafeImageError("图片数据格式或大小无效。");
    const buffer = Buffer.from(source.base64, "base64");
    identifyImage(buffer);
    return buffer;
  }
  let url = httpsImageUrl(source.url);
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const response = await fetcher(url.href, { redirect: "manual", signal });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location || redirects === 4)
        throw new SafeImageError("图片下载重定向无效。");
      url = httpsImageUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new SafeImageError("图片下载失败，请重试。");
    }
    if (response.url) httpsImageUrl(response.url);
    const buffer = await boundedResponse(response, MAX_IMAGE_BYTES, signal);
    identifyImage(buffer);
    return buffer;
  }
  throw new SafeImageError("图片下载失败。");
}

export interface DecodedImage {
  png: Buffer;
  thumbnail: Buffer;
  previewDataUrl: string;
  width: number;
  height: number;
}

export type ImageDecoder = (buffer: Buffer) => NativeImage;

export function decodeImage(
  buffer: Buffer,
  decoder: ImageDecoder = nativeImage.createFromBuffer
): DecodedImage {
  const mimeType = identifyImage(buffer);
  if (
    mimeType === "image/png" &&
    buffer.length >= 24 &&
    (buffer.readUInt32BE(16) > 4096 || buffer.readUInt32BE(20) > 4096)
  )
    throw new SafeImageError("图片尺寸无效，长边不得超过 4096 像素。");
  const image = decoder(buffer);
  if (image.isEmpty())
    throw new SafeImageError("图片无法解码，请更换服务输出格式。");
  const { width, height } = image.getSize();
  if (width < 1 || height < 1 || Math.max(width, height) > 4096)
    throw new SafeImageError("图片尺寸无效，长边不得超过 4096 像素。");
  const png = image.toPNG();
  if (png.length > MAX_IMAGE_BYTES)
    throw new SafeImageError("图片转换后超过 20 MB，请降低图片尺寸。");
  const scale = Math.min(1, 480 / Math.max(width, height));
  const thumbnail = image
    .resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      quality: "good"
    })
    .toJPEG(85);
  if ((thumbnail.length * 4) / 3 > 4 * 1024 * 1024)
    throw new SafeImageError("图片预览超过大小限制。");
  return {
    png,
    thumbnail,
    width,
    height,
    previewDataUrl: `data:image/jpeg;base64,${thumbnail.toString("base64")}`
  };
}
