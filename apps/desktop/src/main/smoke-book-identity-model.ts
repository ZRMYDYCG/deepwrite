/** The isolated UI smoke exposes a selectable model without provider traffic. */
export function isBookIdentityFauxSmokeModel(
  modelId: string | undefined
): boolean {
  return (
    process.env.DEEPWRITE_SMOKE === "1" &&
    process.env.DEEPWRITE_SMOKE_SUITE === "book-identity" &&
    process.env.DEEPWRITE_APP_MODE === "evaluation" &&
    modelId === "book_identity_smoke_model"
  );
}
