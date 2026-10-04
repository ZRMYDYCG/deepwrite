/** The isolated evaluation smoke selects Faux without registering provider credentials. */
export function isDecompositionFauxSmokeModel(
  modelId: string | undefined
): boolean {
  return (
    process.env.DEEPWRITE_SMOKE === "1" &&
    process.env.DEEPWRITE_SMOKE_SUITE === "decomposition" &&
    process.env.DEEPWRITE_APP_MODE === "evaluation" &&
    modelId === "decomposition_smoke_model"
  );
}
