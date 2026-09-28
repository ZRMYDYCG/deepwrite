/** Per-character token weights for a rough, tokenizer-free estimate. */
export interface TextTokenWeights {
  /** Weight for code points above ASCII (CJK, full-width punctuation…). */
  nonAscii: number;
  ascii: number;
}

/**
 * Close to common tokenizers for Chinese prose (about one token per Han
 * character) and to the usual four characters per token for Latin text.
 */
export const DEFAULT_TEXT_TOKEN_WEIGHTS: TextTokenWeights = {
  nonAscii: 1,
  ascii: 0.25
};

/** Conservative weights for pre-flight budgets that must never overflow. */
export const CONSERVATIVE_TEXT_TOKEN_WEIGHTS: TextTokenWeights = {
  nonAscii: 1.5,
  ascii: 0.25
};

/** Tokens an image block is assumed to occupy in a model request. */
export const ESTIMATED_IMAGE_TOKENS = 1_200;

export function estimateTextTokens(
  text: string,
  weights: TextTokenWeights = DEFAULT_TEXT_TOKEN_WEIGHTS
): number {
  let count = 0;
  for (const char of text) {
    count += char.codePointAt(0)! > 127 ? weights.nonAscii : weights.ascii;
  }
  return Math.ceil(count);
}
