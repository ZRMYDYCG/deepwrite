import type {
  ChatAssistantProjectRef,
  DeepWriteApi
} from "@deepwrite/contracts";
import type { createIdentitySmokeUi } from "./smoke-book-identity-ui";
import type {
  checkIdentityAdoption,
  observeIdentityAdoption
} from "./smoke-book-identity-adoption";

/** Switch, restore and re-adopt titles at the current theme and viewport size. */
export async function checkIdentityAdoptionVariants(
  makeUi: typeof createIdentitySmokeUi,
  observeAdoption: typeof observeIdentityAdoption,
  checkAdoption: typeof checkIdentityAdoption,
  book: ChatAssistantProjectRef
) {
  const api = (globalThis as unknown as { deepwrite: DeepWriteApi }).deepwrite;
  const { pause, until } = makeUi();
  document
    .querySelectorAll<HTMLButtonElement>(".identity-tabs button")[0]!
    .click();
  await until(
    () => document.querySelector(".identity-candidate-title"),
    "title candidates"
  );
  let record = await api.bookIdentity.get({ book });
  const round = record.rounds.find((entry) => entry.field === "title")!;
  if (round.field !== "title" || round.candidates.length < 2)
    throw new Error("Missing title switching fixtures.");
  const originalIndex = round.candidates.findIndex(
    (candidate) => candidate.id === record.adopted.title?.candidateId
  );
  const alternateIndex = originalIndex === 0 ? 1 : 0;
  if (originalIndex < 0) throw new Error("Missing original title adoption.");
  const checks = [];
  for (const [action, index] of [
    ["switch", alternateIndex],
    ["restore", originalIndex],
    ["repeat", originalIndex]
  ] as const) {
    const revision = record.revision;
    const result = await checkAdoption(
      makeUi,
      observeAdoption,
      async (button) => {
        button.click();
        record = await until(async () => {
          const value = await api.bookIdentity.get({ book });
          return value.revision > revision &&
            value.adopted.title?.candidateId === round.candidates[index]!.id &&
            button.getAttribute("aria-pressed") === "true" &&
            !button.disabled
            ? value
            : null;
        }, `title ${action}`);
      },
      `.identity-candidate:nth-child(${index + 1}) .identity-adopt`
    );
    checks.push({ action, ...result });
  }
  document
    .querySelectorAll<HTMLButtonElement>(".identity-tabs button")[2]!
    .click();
  await until(
    () => document.querySelector(".identity-cover-image"),
    "restore cover tab"
  );
  document.querySelector<HTMLElement>(".book-identity-page")!.scrollTop = 0;
  await pause();
  return { checks, revision: record.revision };
}
