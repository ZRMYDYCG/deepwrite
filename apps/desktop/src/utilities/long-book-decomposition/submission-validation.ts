import {
  decompositionReadingUnitId,
  normalizeDecompositionRegistry,
  type LongBookDecompositionJob,
  type DecompositionSubmitInput,
  type DecompositionRegistry,
  type DecompositionReadingCard
} from "@deepwrite/contracts";
import { validateDecompositionRegistryCoverage } from "./workflow";

export function assertDecompositionSubmission(
  job: LongBookDecompositionJob,
  input: DecompositionSubmitInput,
  registry: DecompositionRegistry,
  cards: DecompositionReadingCard[]
): void {
  const unit = job.units[input.unitId];
  if (
    !unit ||
    input.outputVersion !== job.outputVersion ||
    input.inputRevision !== unit.inputRevision ||
    input.attemptId !== unit.attemptId ||
    job.activeAttemptId !== input.attemptId ||
    job.status !== "running"
  )
    throw new Error("旧运行、旧输入版本或越包提交被拒绝。");
  if (!job.target || !["ready", "writing"].includes(job.target.state))
    throw new Error("真实目标尚未准备。");
  if (unit.status === "conflict" || unit.status === "skipped")
    throw new Error("此单元当前不能提交。");
  const { data, unitId } = input;
  if (data.kind === "reading") {
    if (data.card.chapters.length !== 1)
      throw new Error("阅读检查点每次必须完整提交一章或一个片段。");
    const chapter = data.card.chapters[0]!;
    const chunk = job.chunks.find(({ id }) => id === data.card.chunkId);
    if (
      !chunk ||
      !chunk.chapterIds.includes(chapter.chapterId) ||
      chapter.order < chunk.startOrder ||
      chapter.order > chunk.endOrder ||
      chapter.segmentIndex !== chunk.segment?.index ||
      decompositionReadingUnitId(chunk, chapter.chapterId) !== unitId
    )
      throw new Error("章节提交范围不匹配。");
    for (const world of data.card.world)
      if (
        world.categoryId !== "other" &&
        !job.profile.worldCategories.some(({ id }) => id === world.categoryId)
      )
        throw new Error("未知世界观类别。");
  } else if (data.kind === "finish-card") {
    const chunk = job.chunks.find(({ id }) => id === unitId);
    if (
      !chunk ||
      chunk.chapterIds.some(
        (id) =>
          job.units[decompositionReadingUnitId(chunk, id)]?.status !== "done"
      )
    )
      throw new Error("阅读块仍有未持久化的章节或片段。");
  } else if (data.kind === "registry") {
    if (!unitId.startsWith("registry:"))
      throw new Error("名册提交单元不匹配。");
    const normalized = normalizeDecompositionRegistry(data.registry, 1);
    if (unitId === "registry:merge")
      validateDecompositionRegistryCoverage(normalized, cards);
    for (const entry of normalized.characters)
      if (
        entry.firstChapterOrder < job.source.range.start ||
        entry.firstChapterOrder > job.source.range.end
      )
        throw new Error("人物首次出场章号越界。");
    for (const entry of normalized.terms)
      if (
        entry.categoryId !== "other" &&
        !job.profile.worldCategories.some(({ id }) => id === entry.categoryId)
      )
        throw new Error("设定名册类别无效。");
  } else if (data.kind === "review") {
    if (unitId !== `review:${data.review.domain}`)
      throw new Error("审校领域不匹配。");
    for (const issue of data.review.issues)
      if (
        issue.chapterOrders.some(
          (order) =>
            order < job.source.range.start || order > job.source.range.end
        ) ||
        (issue.unitId && !job.units[issue.unitId])
      )
        throw new Error("审校问题的单元或证据章号无效。");
  } else {
    const asset = data.asset;
    const expected =
      asset.kind === "chronicle"
        ? unitId.startsWith("chronicle:")
        : asset.kind === "book-line"
          ? unitId === "plot:book-line"
          : asset.kind === "foreshadowing"
            ? unitId === "plot:foreshadowing"
            : asset.kind === "opening"
              ? unitId === "plot:opening"
              : asset.kind === "character-volume"
                ? unitId.startsWith("character-volume:") &&
                  JSON.stringify(unit.biography) ===
                    JSON.stringify({
                      registryId: asset.registryId,
                      volume: asset.volume,
                      startOrder: asset.startOrder,
                      endOrder: asset.endOrder
                    })
                : asset.kind === "character"
                  ? unitId === `character:${asset.registryId}`
                  : asset.kind === "world"
                    ? unitId === `world:${asset.categoryId}`
                    : asset.kind === "style"
                      ? unitId === "style:profile"
                      : asset.kind === "continuity"
                        ? unitId === "continuity:latest"
                        : unitId.startsWith("topic:");
    if (!expected) throw new Error("成品键与结构不匹配。");
    if (
      asset.kind === "topic" &&
      (unit.topic?.domain !== asset.domain || unit.topic.title !== asset.title)
    )
      throw new Error("专题与当前登记的领域或标题不匹配。");
    if (
      (asset.kind === "character" || asset.kind === "character-volume") &&
      !registry.characters.some(
        ({ id, ignored, tier }) =>
          id === asset.registryId && !ignored && tier !== "passerby"
      )
    )
      throw new Error("成品人物不在确认名册中。");
    if (
      asset.kind === "world" &&
      !registry.terms.some(
        ({ categoryId, ignored }) => categoryId === asset.categoryId && !ignored
      )
    )
      throw new Error("成品世界观类别不在确认名册中。");
    const orders =
      asset.kind === "chronicle"
        ? asset.points.flatMap(({ startOrder, endOrder }) => [
            startOrder,
            endOrder
          ])
        : asset.kind === "foreshadowing"
          ? asset.lines.flatMap(({ beats }) =>
              beats.map(({ chapterOrder }) => chapterOrder)
            )
          : asset.kind === "style"
            ? asset.excerpts.map(({ chapterOrder }) => chapterOrder)
            : [];
    if (
      orders.some(
        (order) =>
          order < job.source.range.start || order > job.source.range.end
      )
    )
      throw new Error("成品证据章号越界。");
  }
}
