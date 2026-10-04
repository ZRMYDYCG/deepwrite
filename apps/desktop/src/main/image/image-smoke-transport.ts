import { nativeImage } from "electron";
import type { ImageServiceOptions } from "./image-service";

/** The desktop smoke fixture is isolated from all external image services. */
export function imageSmokeOptions(): ImageServiceOptions {
  return {
    secureStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`smoke-only:${value}`),
      decryptString: (value) => value.toString().replace(/^smoke-only:/u, "")
    },
    async fetcher(url) {
      if (new URL(url).hostname !== "image.example.test")
        throw new Error("Image smoke requires an isolated endpoint.");
      const bitmap = Buffer.alloc(600 * 800 * 4);
      for (let y = 0; y < 800; y++)
        for (let x = 0; x < 600; x++) {
          const offset = (y * 600 + x) * 4;
          bitmap[offset] = 70 + Math.floor(y / 24);
          bitmap[offset + 1] = 48 + Math.floor(y / 32);
          bitmap[offset + 2] = 32 + Math.floor(y / 32);
          bitmap[offset + 3] = 255;
        }
      const image = nativeImage.createFromBitmap(bitmap, {
        width: 600,
        height: 800
      });
      return new Response(
        JSON.stringify({
          data: [{ b64_json: image.toPNG().toString("base64") }]
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
  };
}
