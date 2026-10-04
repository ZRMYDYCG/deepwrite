import { identityApi } from "./book-identity-utils";
import { computed, reactive, type Ref } from "vue";
import { createId } from "@deepwrite/shared";
import {
  assertExtrasAgentBudget,
  chatAssistantProjectKey,
  type BookIdentityField,
  type ChatAssistantProjectRef,
  type ExtrasAgentTask,
  type ModelConfig,
  type ThinkingLevel
} from "@deepwrite/contracts/renderer";
import {
  startExtrasAgentTask,
  type ExtrasAgentTaskHandle
} from "../agent-runtime/extrasAgentTask";
import type { AnalysisRunState } from "../analysis-ui/analysis-process";
import { bookIdentityAgentRunning } from "../../stores/bookIdentityActivity";
import { formatError } from "../../i18n/errors";
import { uiMessage } from "../../ui-feedback";
import { identityT as t } from "./book-identity-utils";
import { useCoverRenderQueue } from "./useCoverRenderQueue";
interface RunState {
  status: AnalysisRunState;
  entries: string[];
  activity: string;
  output: string;
  error: string | null;
}
const states = reactive(new Map<string, RunState>());
const handles = new Map<string, ExtrasAgentTaskHandle>();
const idle: RunState = {
  status: "idle",
  entries: [],
  activity: "",
  output: "",
  error: null
};
const keyFor = (book: ChatAssistantProjectRef, field: BookIdentityField) =>
  `${chatAssistantProjectKey(book)}:${field}`;
function updateActivity() {
  bookIdentityAgentRunning.value = handles.size > 0;
}
export function useIdentityRun(
  book: Readonly<Ref<ChatAssistantProjectRef | null>>,
  field: Readonly<Ref<BookIdentityField>>
) {
  const state = computed(() =>
    book.value ? (states.get(keyFor(book.value, field.value)) ?? idle) : idle
  );
  const busy = computed(() =>
    ["starting", "running", "stopping"].includes(state.value.status)
  );
  async function start(
    task: Extract<
      ExtrasAgentTask,
      {
        agentId:
          "book-title-design" | "book-synopsis-design" | "book-cover-design";
      }
    >,
    model: ModelConfig | undefined,
    thinkingLevel: ThinkingLevel
  ) {
    if (!model) {
      uiMessage.warning(t("selectModel"));
      return;
    }
    if (!("book" in task.input)) return;
    const target = { ...task.input.book };
    const taskField: BookIdentityField =
      task.agentId === "book-title-design"
        ? "title"
        : task.agentId === "book-synopsis-design"
          ? "synopsis"
          : "cover";
    const key = keyFor(target, taskField);
    if (handles.has(key)) return;
    try {
      assertExtrasAgentBudget(task, model);
    } catch (error) {
      uiMessage.error(formatError(error, t("failed")));
      return;
    }
    states.set(key, {
      status: "starting",
      entries: [],
      activity: t("reading"),
      output: "",
      error: null
    });
    const current = states.get(key)!;
    function activity(text: string) {
      current.activity = text;
      current.entries.push(text);
      if (current.entries.length > 100) current.entries.shift();
    }
    const handle = startExtrasAgentTask(
      identityApi(),
      { task, modelId: model.id, thinkingLevel },
      {
        onAccepted: () => {
          current.status = "running";
        },
        onToolRequested: (name) =>
          activity(
            name === "submit_book_identity_candidates"
              ? t("submitting")
              : `${t("reading")} · ${name}`
          ),
        onDelta: (delta) => {
          current.output = (current.output + delta).slice(-20000);
        },
        onOutput: (output) => {
          if (output.kind !== "book-identity-round" || taskField !== "cover")
            return;
          if (
            output.bookKey !== chatAssistantProjectKey(target) ||
            output.field !== taskField
          )
            return;
          void identityApi()
            .bookIdentity.get({ book: target })
            .then((record) => {
              const round = record.rounds.find((r) => r.id === output.roundId);
              if (round?.field === "cover" && round.request.autoRender)
                useCoverRenderQueue().addRound(target, round);
            })
            .catch((error) => uiMessage.error(formatError(error, t("failed"))));
        }
      }
    );
    handles.set(key, handle);
    updateActivity();
    const unsubscribe = identityApi().events.subscribe(handle.handleEvent);
    try {
      const result = await handle.outcome;
      if (
        result.status === "completed" &&
        !result.outputs.some(
          (output) =>
            output.kind === "book-identity-round" &&
            output.bookKey === chatAssistantProjectKey(target) &&
            output.field === taskField
        )
      )
        throw new Error(t("missingResult"));
      current.status = result.status === "completed" ? "completed" : "stopped";
    } catch (error) {
      current.status = "error";
      current.error = formatError(error, t("failed"));
      uiMessage.error(current.error);
    } finally {
      unsubscribe();
      handles.delete(key);
      updateActivity();
    }
  }
  async function stop() {
    if (!book.value) return;
    const handle = handles.get(keyFor(book.value, field.value));
    if (!handle) return;
    state.value.status = "stopping";
    try {
      await handle.stop();
    } catch (error) {
      state.value.status = "running";
      uiMessage.error(formatError(error, t("failed")));
    }
  }
  function fieldBusy(value: BookIdentityField) {
    return !!book.value && handles.has(keyFor(book.value, value));
  }
  return {
    state,
    busy,
    start,
    stop,
    fieldBusy,
    newJobId: () => createId("book_identity_job")
  };
}
