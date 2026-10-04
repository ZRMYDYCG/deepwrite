import type { DeepWriteApi } from "@deepwrite/contracts/renderer";
import { useLazyModelFeature } from "./useLazyModelFeature";
export function useLazyLongBookDecomposition(
  api: () => DeepWriteApi | undefined
) {
  return useLazyModelFeature("Long book decomposition", async () => {
    const module = await (
      await import("../extras/long-book-decomposition/loader")
    ).loadController();
    return module.useLongBookDecomposition({ api });
  });
}
