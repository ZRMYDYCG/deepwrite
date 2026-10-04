import { randomUUID } from "node:crypto";
import {
  BOOK_IDENTITY_MAX_COMPOSED_BYTES,
  BOOK_IDENTITY_MAX_IMAGE_BYTES,
  BOOK_IDENTITY_MAX_IMAGES,
  BOOK_IDENTITY_MAX_IMAGES_PER_ROUND,
  CoverImageRefSchema,
  type CoverImageRef,
  type CoverLayout,
  type BookIdentityField,
  type ChatAssistantProjectRef
} from "@deepwrite/contracts";
import { findCandidate } from "./records";
import { decodeBase64, identityFile, imageMime, readBytes } from "./io";
import { BookIdentityStore } from "./store";

interface CoverAssetInput {
  imageId?: string | undefined;
  image: {
    fileBase64: string;
    thumbBase64: string;
    mimeType: string;
    width: number;
    height: number;
    imageProfile: CoverImageRef["imageProfile"];
  };
}

export async function writeCoverAsset(
  store: BookIdentityStore,
  book: ChatAssistantProjectRef,
  roundId: string,
  candidateId: string,
  input: CoverAssetInput
) {
  const bytes = decodeBase64(
    input.image.fileBase64,
    BOOK_IDENTITY_MAX_IMAGE_BYTES
  );
  const thumb = decodeBase64(input.image.thumbBase64, 4 * 1024 * 1024);
  const mime = imageMime(bytes);
  if (
    mime !== input.image.mimeType ||
    mime !== "image/png" ||
    imageMime(thumb) !== "image/jpeg"
  )
    throw new Error("原图必须为 PNG，缩略图必须为 JPEG。");
  const id = input.imageId ?? `img_${randomUUID()}`;
  const image = CoverImageRefSchema.parse({
    id,
    file: `covers/${id}.png`,
    thumb: `covers/${id}.thumb.jpg`,
    width: input.image.width,
    height: input.image.height,
    imageProfile: input.image.imageProfile,
    createdAt: store.now()
  });
  assertPngDimensions(bytes, image.width, image.height);
  return store.mutate(book, async (record, context) => {
    const { round, candidate } = findCandidate(record, roundId, candidateId);
    if (round.field !== "cover" || !("images" in candidate))
      throw new Error("此候选不是封面方案。");
    const images = record.rounds.flatMap((entry) =>
      entry.field === "cover"
        ? entry.candidates.flatMap((candidate) => candidate.images)
        : []
    );
    if (images.length >= BOOK_IDENTITY_MAX_IMAGES)
      throw new Error("每本书最多保留 240 张封面图，请先清理旧记录。");
    if (
      round.candidates.reduce(
        (sum, candidate) => sum + candidate.images.length,
        0
      ) >= BOOK_IDENTITY_MAX_IMAGES_PER_ROUND
    )
      throw new Error("单轮最多保留 12 张封面图。");
    if (images.some((entry) => entry.id === id))
      throw new Error("封面图片标识已存在。");
    await context.assets.put(image.file, bytes, true);
    await context.assets.put(image.thumb, thumb, true);
    candidate.images.push(image);
    candidate.lastRenderError = null;
  });
}

export async function saveComposedCover(
  store: BookIdentityStore,
  book: ChatAssistantProjectRef,
  roundId: string,
  candidateId: string,
  imageId: string,
  layout: CoverLayout,
  pngBase64: string
) {
  const bytes = decodeBase64(pngBase64, BOOK_IDENTITY_MAX_COMPOSED_BYTES);
  if (imageMime(bytes) !== "image/png") throw new Error("排版成品必须是 PNG。");
  return store.mutate(book, async (record, context) => {
    const { candidate } = findCandidate(record, roundId, candidateId);
    if (!("images" in candidate)) throw new Error("此候选不是封面方案。");
    const image = candidate.images.find((entry) => entry.id === imageId);
    if (!image) throw new Error("封面图片不存在。");
    assertPngDimensions(bytes, image.width, image.height);
    const file = `covers/${image.id}.composed.png`;
    await context.assets.put(file, bytes);
    image.composed = { file, layout, updatedAt: store.now() };
  });
}

export async function adopt(
  store: BookIdentityStore,
  book: ChatAssistantProjectRef,
  field: BookIdentityField,
  roundId: string,
  candidateId: string,
  imageId?: string
) {
  return store.mutate(book, async (record, context) => {
    const { round, candidate } = findCandidate(record, roundId, candidateId);
    if (round.field !== field) throw new Error("采用字段与候选不一致。");
    const adoptedAt = store.now();
    if (field === "title" && "title" in candidate)
      record.adopted.title = {
        candidateId,
        title: candidate.title,
        ...(candidate.subtitle ? { subtitle: candidate.subtitle } : {}),
        adoptedAt
      };
    else if (field === "synopsis" && "text" in candidate)
      record.adopted.synopsis = {
        candidateId,
        text: candidate.text,
        ...(candidate.hook ? { hook: candidate.hook } : {}),
        adoptedAt
      };
    else if (field === "cover" && "images" in candidate) {
      const image = candidate.images.find((entry) => entry.id === imageId);
      if (!image) throw new Error("请选择已生成的封面图片。");
      const bytes = await readBytes(
        await identityFile(
          context.directory,
          image.composed?.file ?? image.file
        ),
        BOOK_IDENTITY_MAX_COMPOSED_BYTES
      );
      if (imageMime(bytes) !== "image/png")
        throw new Error("采用封面需要 PNG 原图或排版成品。");
      await context.assets.put("cover.png", bytes);
      record.adopted.cover = {
        candidateId,
        imageId: image.id,
        file: "cover.png",
        adoptedAt
      };
    }
  });
}

export async function clearAdoption(
  store: BookIdentityStore,
  book: ChatAssistantProjectRef,
  field: BookIdentityField
) {
  return store.mutate(book, (record, context) => {
    delete record.adopted[field];
    if (field === "cover") context.deleteFiles.add("cover.png");
  });
}

function assertPngDimensions(
  bytes: Buffer,
  width: number,
  height: number
): void {
  if (
    bytes.length < 33 ||
    bytes.subarray(12, 16).toString() !== "IHDR" ||
    bytes.readUInt32BE(16) !== width ||
    bytes.readUInt32BE(20) !== height
  )
    throw new Error("PNG 尺寸与封面原图不一致。");
}
