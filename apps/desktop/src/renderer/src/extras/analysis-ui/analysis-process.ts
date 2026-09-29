import { createScopedTranslator } from "../../i18n";

const t = createScopedTranslator("extras.analysisUi");
export interface AnalysisProcessEntry {
  id: string;
  title: string;
  createdAt?: string | null;
  detail?: string | null;
  phase?: string | null;
  tone?: "info" | "success" | "error";
}

export type AnalysisRunState =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "error"
  | "completed";

export const analysisRunLabels: Record<AnalysisRunState, string> = {
  get idle() {
    return t("waitingToStart");
  },
  get starting() {
    return t("preparing");
  },
  get running() {
    return t("analyzing");
  },
  get stopping() {
    return t("stopping");
  },
  get stopped() {
    return t("stopped");
  },
  get error() {
    return t("analysisFailed");
  },
  get completed() {
    return t("analysisComplete");
  }
};
