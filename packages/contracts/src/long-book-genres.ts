import { z } from "zod";

export const LONG_BOOK_GENRES = [
  "玄幻",
  "奇幻",
  "武侠",
  "仙侠",
  "都市",
  "现实",
  "历史",
  "军事",
  "科幻",
  "悬疑",
  "言情",
  "其他"
] as const;

/**
 * The enum is primarily a UI suggestion list. Imported projects may preserve
 * a custom genre, so the wire contract deliberately accepts any short label.
 */
export const LongBookGenreSchema = z.string().trim().min(1).max(120);
export type LongBookGenre = z.infer<typeof LongBookGenreSchema>;
