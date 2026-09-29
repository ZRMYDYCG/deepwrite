import { createScopedTranslator } from "../i18n";
import type { AgentEditProposal } from "../types/conversation";

const t = createScopedTranslator("components.approvalDiscardPresentation");

type DiscardState = AgentEditProposal["discardState"];

export function approvalDiscardStatusLabel(
  state: DiscardState
): string | undefined {
  if (state?.status === "discarding") return t("discarding");
  if (state?.status === "discarded") return t("discarded");
  if (state?.status === "conflict") return t("discardConflict");
  if (state?.status === "error") return t("discardFailed");
  return undefined;
}

export function approvalDiscardVisualStatus(
  state: DiscardState
): AgentEditProposal["status"] | undefined {
  if (state?.status === "discarding") return "accepting";
  if (state?.status === "discarded") return "rejected";
  if (state?.status === "conflict") return "conflict";
  if (state?.status === "error") return "error";
  return undefined;
}

export function approvalDiscardStatusMessage(
  state: DiscardState
): string | undefined {
  return state?.message;
}

export function shouldShowApprovalDiscardButton(
  discardable: boolean,
  accepted: boolean,
  state: DiscardState
): boolean {
  return discardable && accepted && state?.status !== "discarded";
}
