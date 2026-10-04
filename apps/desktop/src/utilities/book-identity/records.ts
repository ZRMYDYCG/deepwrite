import { randomUUID } from "node:crypto";
import {
  BOOK_IDENTITY_CANDIDATE_LIMITS,
  BOOK_IDENTITY_MAX_ROUNDS_PER_FIELD,
  BookIdentityRoundSchema,
  BookSynopsisCandidateSchema,
  BookTitleCandidateSchema,
  type BookIdentityCandidate,
  type BookIdentityField,
  type BookIdentityRecord,
  type BookIdentityRound,
  type BookTitleCandidateInput,
  type BookSynopsisCandidateInput,
  type ChatAssistantProjectRef
} from "@deepwrite/contracts";
import { roundAssets } from "./assets";
import { BookIdentityStore } from "./store";

export function findCandidate(
  record: BookIdentityRecord,
  roundId: string,
  candidateId: string
) {
  const round = record.rounds.find((entry) => entry.id === roundId);
  if (!round) throw new Error("设计轮次不存在。");
  const candidate = round.candidates.find((entry) => entry.id === candidateId);
  if (!candidate) throw new Error("设计候选不存在。");
  return { round, candidate };
}

export function protectsAdopted(
  record: BookIdentityRecord,
  round: BookIdentityRound
): boolean {
  const adopted = record.adopted[round.field];
  return (
    !!adopted &&
    round.candidates.some((candidate) => candidate.id === adopted.candidateId)
  );
}

export async function appendRound(
  store: BookIdentityStore,
  book: ChatAssistantProjectRef,
  input: BookIdentityRound
) {
  const round = BookIdentityRoundSchema.parse(input);
  if (
    round.source !== "agent" ||
    round.candidates.length !== round.request.candidateCount ||
    round.candidates.length > BOOK_IDENTITY_CANDIDATE_LIMITS[round.field]
  )
    throw new Error("本轮候选数量与请求不一致。");
  if (
    round.field === "cover" &&
    round.candidates.some((candidate) => candidate.images.length)
  )
    throw new Error("新封面轮次不能预填图片引用。");
  const record = await store.mutate(book, (record) => {
    if (record.rounds.some((entry) => entry.id === round.id))
      throw new Error("本轮已经提交。");
    if (
      record.rounds.filter((entry) => entry.field === round.field).length >=
      BOOK_IDENTITY_MAX_ROUNDS_PER_FIELD
    )
      throw new Error("此字段已保留 60 轮，请先清理旧记录。");
    record.rounds.push(round);
  });
  return { roundId: round.id, revision: record.revision };
}

export async function addManualCandidate(
  store: BookIdentityStore,
  book: ChatAssistantProjectRef,
  field: "title" | "synopsis",
  input: BookTitleCandidateInput | BookSynopsisCandidateInput
) {
  return store.mutate(book, (record) => {
    const base = {
      ...input,
      id: `cand_${randomUUID()}`,
      starred: false,
      edited: false
    };
    const candidate =
      field === "title"
        ? BookTitleCandidateSchema.parse(base)
        : BookSynopsisCandidateSchema.parse({
            ...base,
            wordCount: "text" in input ? Array.from(input.text).length : 0
          });
    let round = record.rounds.find(
      (entry) => entry.source === "manual" && entry.field === field
    );
    if (!round) {
      if (
        record.rounds.filter((entry) => entry.field === field).length >=
        BOOK_IDENTITY_MAX_ROUNDS_PER_FIELD
      )
        throw new Error("此字段已保留 60 轮，请先清理旧记录。");
      round = BookIdentityRoundSchema.parse({
        id: `round_${randomUUID()}`,
        source: "manual",
        field,
        createdAt: store.now(),
        request: { candidateCount: 1, seedCandidateIds: [] },
        candidates: []
      });
      record.rounds.push(round);
    }
    if (round.field === "title" && "title" in candidate)
      round.candidates.push(candidate);
    else if (round.field === "synopsis" && "text" in candidate)
      round.candidates.push(candidate);
  });
}

export async function updateCandidate(
  store: BookIdentityStore,
  book: ChatAssistantProjectRef,
  roundId: string,
  candidateId: string,
  patch: Record<string, unknown>
) {
  return store.mutate(book, (record) => {
    const { round, candidate } = findCandidate(record, roundId, candidateId);
    const allowed =
      round.field === "title"
        ? ["title", "subtitle", "angle", "rationale", "keywords", "starred"]
        : round.field === "synopsis"
          ? ["hook", "text", "angle", "rationale", "starred"]
          : [
              "concept",
              "scene",
              "composition",
              "palette",
              "artStyle",
              "typography",
              "titlePlacement",
              "rationale",
              "prompt",
              "negativePrompt",
              "starred"
            ];
    if (Object.keys(patch).some((key) => !allowed.includes(key)))
      throw new Error("不能修改候选的受控字段。");
    Object.assign(candidate, patch);
    if (
      Object.keys(patch).some(
        (key) => key !== "starred" && key !== "lastRenderError"
      )
    )
      candidate.edited = true;
    if ("text" in candidate)
      candidate.wordCount = Array.from(candidate.text).length;
  });
}

export async function deleteRound(
  store: BookIdentityStore,
  book: ChatAssistantProjectRef,
  roundId: string
) {
  return store.mutate(book, (record, context) => {
    const round = record.rounds.find((entry) => entry.id === roundId);
    if (!round) throw new Error("设计轮次不存在。");
    if (protectsAdopted(record, round))
      throw new Error("本轮含有已采用候选，不能删除。");
    record.rounds = record.rounds.filter((entry) => entry.id !== roundId);
    for (const file of roundAssets(round)) context.deleteFiles.add(file);
  });
}

export async function pruneRounds(
  store: BookIdentityStore,
  book: ChatAssistantProjectRef,
  field: BookIdentityField
) {
  return store.mutate(book, (record, context) => {
    record.rounds = record.rounds.filter((round) => {
      if (
        round.field !== field ||
        protectsAdopted(record, round) ||
        round.candidates.some((candidate) => candidate.starred)
      )
        return true;
      for (const file of roundAssets(round)) context.deleteFiles.add(file);
      return false;
    });
  });
}

export function candidateSummary(
  field: BookIdentityField,
  candidate: BookIdentityCandidate
): string {
  if (field === "title" && "title" in candidate) return candidate.title;
  if (field === "synopsis" && "text" in candidate)
    return candidate.hook || candidate.text.slice(0, 120);
  return "concept" in candidate ? candidate.concept : "";
}
