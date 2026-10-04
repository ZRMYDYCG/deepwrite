import { computed, ref, shallowRef } from "vue";
import {
  readyDecompositionUnitIds,
  assertExtrasAgentBudget,
  decompositionInputBudget,
  type DeepWriteApi,
  type LongBookDecompositionJob,
  type ModelConfig,
  type SystemEventEnvelope
} from "@deepwrite/contracts/renderer";
import {
  startExtrasAgentTask,
  type ExtrasAgentTaskHandle
} from "../agent-runtime/extrasAgentTask";
import { getErrorPayload } from "../../i18n/errors";
import { createDecompositionModelCapacities } from "./model-capacity";

/** The page can unmount; this controller belongs to the workspace feature host. */
export function createDecompositionEngine(
  api: () => DeepWriteApi,
  models: () => readonly ModelConfig[]
) {
  const modelCapacities = createDecompositionModelCapacities(api);
  const job = shallowRef<LongBookDecompositionJob | null>(null);
  const running = ref(false);
  const error = ref<string | null>(null);
  const waitingForSlot = ref(false);
  let wakeSlot: (() => void) | undefined;
  const capacityError = (cause: unknown): boolean => {
    if (!cause || typeof cause !== "object") return false;
    const value = cause as { code?: unknown; cause?: unknown };
    return (
      value.code === "agent.capacity_reached" ||
      value.code === "agent.extras_capacity_reached" ||
      (value.cause && value.cause !== cause
        ? capacityError(value.cause)
        : false)
    );
  };
  const activity = ref<string[]>([]);
  let handle: ExtrasAgentTaskHandle | undefined;
  let generation = 0;
  let refreshSequence = 0;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshing = false;
  let refreshPending = false;
  const failureMessage = (cause: unknown) =>
    getErrorPayload(cause)?.message ??
    (cause instanceof Error ? cause.message : String(cause));
  function reportBlockedUnit() {
    const blocked = Object.values(job.value?.units ?? {}).find(
      (unit) => ["conflict", "failed"].includes(unit.status) && unit.lastError
    );
    if (blocked?.lastError) error.value = blocked.lastError;
  }
  async function refresh() {
    const id = job.value?.id;
    const sequence = ++refreshSequence;
    if (!id) return;
    const latest = await api().longBookDecomposition.getJob(id);
    if (job.value?.id === id && sequence === refreshSequence) {
      job.value = latest;
      reportBlockedUnit();
    }
  }
  function queueRefresh() {
    refreshPending = true;
    if (refreshTimer || refreshing) return;
    refreshTimer = setTimeout(async () => {
      refreshTimer = undefined;
      refreshPending = false;
      refreshing = true;
      try {
        await refresh();
      } catch {
        /* The package boundary reports persistent errors. */
      } finally {
        refreshing = false;
        if (refreshPending) queueRefresh();
      }
    }, 400);
  }
  async function control(
    action: Parameters<
      DeepWriteApi["longBookDecomposition"]["control"]
    >[0]["action"],
    unitId?: string,
    conflictChoice?: "keep-user" | "regenerate"
  ) {
    if (!job.value) return;
    refreshSequence++;
    job.value = await api().longBookDecomposition.control({
      jobId: job.value.id,
      action,
      ...(unitId ? { unitId } : {}),
      ...(conflictChoice ? { conflictChoice } : {})
    });
    reportBlockedUnit();
  }
  async function run() {
    if (running.value || !job.value) return;
    running.value = true;
    error.value = null;
    const epoch = ++generation;
    try {
      await control("resume");
      while (epoch === generation && job.value && job.value.phase !== "done") {
        const current: LongBookDecompositionJob = job.value;
        if (current.phase === "registry_review") break;
        const unitIds = readyDecompositionUnitIds(current);
        if (!unitIds.length) {
          const previous: LongBookDecompositionJob["phase"] = current.phase;
          await control("advance");
          if (job.value?.phase === previous) break;
          continue;
        }
        const phase = current.phase as
          "read" | "registry" | "integrate" | "review";
        const chosen =
          phase === "read"
            ? current.models.reading
            : current.models.integration;
        const model = models().find(({ id }) => id === chosen.modelId);
        if (!model) throw new Error("请选择可用的拆解模型。");
        const modelCapacity = await modelCapacities.resolve(model);
        if (epoch !== generation) break;
        assertExtrasAgentBudget(
          {
            agentId: "long-book-decomposition",
            profile: current.profile,
            input: {
              jobId: current.id,
              phase,
              unitIds,
              outputVersion: current.outputVersion,
              mode: current.mode,
              attemptId: "ldattempt_preflight",
              modelId: chosen.modelId,
              thinkingLevel: chosen.thinkingLevel,
              units: current.units,
              inputBudget: decompositionInputBudget(
                chosen,
                current.profile.systemPrompt.length
              ),
              contextWindow: chosen.contextWindow,
              ...(chosen.maxTokens ? { maxTokens: chosen.maxTokens } : {})
            }
          },
          modelCapacity
        );
        let acceptedJob: Promise<LongBookDecompositionJob> | undefined;
        activity.value = [];
        handle = startExtrasAgentTask(
          api(),
          {
            modelId: chosen.modelId,
            thinkingLevel: chosen.thinkingLevel,
            task: {
              agentId: "long-book-decomposition",
              profileId: current.profile.id,
              input: { jobId: current.id, phase, unitIds }
            }
          },
          {
            onAccepted: () => {
              acceptedJob = api().longBookDecomposition.getJob(current.id);
            },
            onSubagentEvent: (event) => {
              if (event.type === "subagent.planned") return;
              const label =
                event.type === "subagent.completed"
                  ? `${event.payload.name} · ${event.payload.status}`
                  : event.payload.name;
              activity.value = [...activity.value.slice(-49), label];
            },
            onOutput: () => {
              queueRefresh();
            }
          }
        );
        let failure: string | undefined;
        let capacity = false;
        try {
          await handle.outcome;
        } catch (cause) {
          capacity = capacityError(cause);
          failure = failureMessage(cause);
        }
        if (capacity && epoch === generation) {
          waitingForSlot.value = true;
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              wakeSlot = undefined;
              resolve();
            }, 5000);
            wakeSlot = () => {
              clearTimeout(timer);
              wakeSlot = undefined;
              resolve();
            };
          });
          waitingForSlot.value = false;
          handle = undefined;
          if (epoch !== generation) break;
          await refresh();
          continue;
        }
        const snapshot = await acceptedJob?.catch(() => undefined);
        const attemptId =
          snapshot &&
          unitIds.map((id) => snapshot.units[id]?.attemptId).find(Boolean);
        if (epoch !== generation) break;
        if (attemptId)
          job.value = await api().longBookDecomposition.control({
            jobId: current.id,
            action: "finish-package",
            attemptId,
            ...(failure ? { error: failure, failed: true } : {})
          });
        else await refresh();
        reportBlockedUnit();
        handle = undefined;
        if (job.value?.status === "failed") break;
        // Core pauses once usage passes the accepted limit; continuing is
        // the user's call.
        if (job.value?.status === "stopped") {
          if (job.value.lastError) error.value = job.value.lastError;
          break;
        }
        if (failure && !attemptId) throw new Error(failure);
      }
    } catch (cause) {
      error.value = failureMessage(cause);
    } finally {
      handle = undefined;
      running.value = false;
    }
  }
  return {
    job,
    error,
    activity,
    waitingForSlot,
    modelCapacity: modelCapacities.peek,
    resolveModelCapacity: modelCapacities.resolve,
    isBusy: computed(() => running.value),
    refresh,
    control,
    run,
    async stop() {
      generation++;
      wakeSlot?.();
      waitingForSlot.value = false;
      await handle?.stop();
      await control("stop");
      running.value = false;
    },
    handleEvent(event: SystemEventEnvelope) {
      if (
        event.type === "agent.message_completed" ||
        event.type === "agent.error"
      )
        wakeSlot?.();
      handle?.handleEvent(event);
    },
    dispose() {
      modelCapacities.dispose();
      generation++;
      refreshSequence++;
      refreshPending = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = undefined;
      wakeSlot?.();
      waitingForSlot.value = false;
      handle?.dispose();
      handle = undefined;
      running.value = false;
    }
  };
}
