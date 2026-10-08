import type {
  DecompositionChunk,
  LongBookAnalysisChapter
} from "@deepwrite/contracts";
import type { ExtrasAgentRunServices } from "../../definition";

export async function queryAll(
  services: ExtrasAgentRunServices,
  jobId: string,
  request: Parameters<
    NonNullable<ExtrasAgentRunServices["decompositionQuery"]>
  >[1]
) {
  if (!services.decompositionQuery) throw new Error("拆解查询桥不可用。");
  let text = "";
  let cursor: number | null = 0;
  do {
    const page = await services.decompositionQuery(jobId, {
      ...request,
      cursor
    });
    text += page.content;
    cursor = page.nextCursor;
  } while (cursor !== null);
  return JSON.parse(text) as {
    chapters: LongBookAnalysisChapter[];
    chunk?: DecompositionChunk;
    startOrder?: number;
    endOrder?: number;
    characters?: Array<{
      ref: string;
      name: string;
      aliases: string[];
      firstChapterOrder: number;
      chunkCount: number;
    }>;
    terms?: Array<{
      ref: string;
      name: string;
      aliases: string[];
      categoryId: string;
      mentionCount: number;
    }>;
  };
}
