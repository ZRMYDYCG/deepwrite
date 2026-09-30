import type { Ref } from "vue";
import type { SystemEventEnvelope } from "@deepwrite/contracts/renderer";
import { createScopedTranslator } from "../../i18n";
import { formatError, getErrorCode } from "../../i18n/errors";
import type { AnalysisProcessEntry } from "./analysis-process";

const t = createScopedTranslator("extras.analysisUi");

export type PresetRunStatus =
  "idle" | "running" | "stopping" | "stopped" | "error" | "completed";
/** One preset's analysis; the batch decides when it starts. */
export interface AnalysisPresetRunner<R> {
  readonly status: Readonly<Ref<PresetRunStatus>>;
  readonly result: Readonly<Ref<R | null>>;
  readonly entries: Readonly<Ref<readonly AnalysisProcessEntry[]>>;
  readonly activity: Readonly<Ref<string>>;
  readonly liveOutput: Readonly<Ref<string>>;
  readonly error: Readonly<Ref<string | null>>;
  readonly progressText?: Readonly<Ref<string>>;
  /** Code of the last failure, used to recognise a full Agent Utility. */
  errorCode(): string | undefined;
  start(): void;
  /** Continues after a failure or stop; long analysis resumes its checkpoint. */
  retry(): void;
  stop(): Promise<unknown>;
  handleEvent(event: SystemEventEnvelope): void;
  dispose(): void;
}

/** Finds an error payload code through wrapped `cause` chains. */
export function errorCodeOf(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const code = getErrorCode(current);
    if (code) return code;
    current = current instanceof Error ? current.cause : undefined;
  }
  return undefined;
}

/**
 * Builds every runner before any starts, so an invalid preset (budget, model)
 * blocks the whole analysis and names the preset.
 */
export function buildPresetRunners<P, R>(
  presets: readonly P[],
  label: (preset: P) => string,
  create: (preset: P) => AnalysisPresetRunner<R>
): AnalysisPresetRunner<R>[] {
  const runners: AnalysisPresetRunner<R>[] = [];
  for (const preset of presets) {
    try {
      runners.push(create(preset));
    } catch (error: unknown) {
      runners.forEach((runner) => runner.dispose());
      throw new Error(
        t("presetCannotStart", {
          preset: label(preset),
          message: formatError(error, t("analysisFailed"))
        }),
        { cause: error }
      );
    }
  }
  return runners;
}
