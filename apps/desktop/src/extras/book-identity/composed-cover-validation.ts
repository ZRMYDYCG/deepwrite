import { nativeImage } from "electron";
import { SafeImageError } from "../../main/image/image-http";

export function validateComposedCover(base64: string): void {
  const png = Buffer.from(base64, "base64");
  if (
    png.length > 25 * 1024 * 1024 ||
    !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new SafeImageError("排版成品必须是 25 MB 以内的 PNG。");
  if (
    png.length < 24 ||
    png.readUInt32BE(16) > 4096 ||
    png.readUInt32BE(20) > 4096
  )
    throw new SafeImageError("排版成品尺寸超限，请重新保存。");
  const image = nativeImage.createFromBuffer(png);
  const { width, height } = image.getSize();
  if (
    image.isEmpty() ||
    width < 1 ||
    height < 1 ||
    Math.max(width, height) > 4096
  )
    throw new SafeImageError("排版成品无法解码或尺寸超限，请重新保存。");
}
