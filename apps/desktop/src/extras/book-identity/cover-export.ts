import { constants } from "node:fs";
import { open, writeFile } from "node:fs/promises";
import { dialog, nativeImage } from "electron";
import {
  BookIdentityReadCandidateResultSchema,
  type BookIdentityExportCoverInput
} from "@deepwrite/contracts";
import { SafeImageError } from "../../main/image/image-http";
import { coreCoverAssetResolver } from "./cover-protocol";
import { identityCore, type IdentityCore } from "./core-client";

export async function exportCover(
  core: IdentityCore,
  input: BookIdentityExportCoverInput,
  saveDialog: Pick<typeof dialog, "showSaveDialog"> = dialog
): Promise<{ cancelled: boolean; path?: string }> {
  let file = "cover.png";
  if (input.roundId && input.candidateId && input.imageId) {
    const { candidate } = BookIdentityReadCandidateResultSchema.parse(
      await identityCore(
        core,
        "bookIdentity.readCandidate",
        {
          book: input.book,
          roundId: input.roundId,
          candidateId: input.candidateId
        },
        input.book
      )
    );
    const image = candidate.images.find((entry) => entry.id === input.imageId);
    if (!image) throw new SafeImageError("封面图片不存在，请刷新后重试。");
    file = image.composed?.file ?? image.file;
  }
  const asset = await coreCoverAssetResolver(core)(input.book, file);
  const handle = await open(
    asset.path,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  let buffer: Buffer;
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.size !== asset.byteSize ||
      stat.size > 25 * 1024 * 1024
    )
      throw new SafeImageError("封面文件无效。");
    buffer = await handle.readFile();
  } finally {
    await handle.close();
  }
  if (input.size !== "original") {
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty())
      throw new SafeImageError("封面无法解码，请重新保存封面。");
    const [width, height] = input.size.split("x").map(Number);
    buffer = image
      .resize({ width: width!, height: height!, quality: "best" })
      .toPNG();
  }
  const selection = await saveDialog.showSaveDialog({
    title: "导出封面",
    defaultPath: "cover.png",
    filters: [{ name: "PNG", extensions: ["png"] }]
  });
  if (selection.canceled || !selection.filePath) return { cancelled: true };
  await writeFile(selection.filePath, buffer);
  return { cancelled: false, path: selection.filePath };
}
