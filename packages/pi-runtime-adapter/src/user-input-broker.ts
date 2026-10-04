import {
  AgentUserInputDrawSchema,
  AgentUserInputQuestionsSchema,
  SUBAGENT_DRAW_QUESTION_ID,
  SUBAGENT_DRAW_REJECT_OPTION_ID,
  SessionUserInputResponseAcceptedPayloadSchema,
  SessionUserInputResponsePayloadSchema,
  type AgentUserInputDraw,
  type AgentUserInputQuestion,
  type SessionUserInputResponseAcceptedPayload,
  type SessionUserInputResponsePayload
} from "@deepwrite/contracts";

interface PendingUserInput {
  request: {
    sessionId: string;
    runId: string;
    requestId: string;
    questions: AgentUserInputQuestion[];
    draw?: AgentUserInputDraw;
  };
  resolve(response: SessionUserInputResponsePayload): void;
  reject(error: Error): void;
  signal?: AbortSignal;
  abortListener?: () => void;
}

export class UserInputResolutionError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "UserInputResolutionError";
  }
}

function abortedError(): Error {
  const error = new Error("User input request was aborted.");
  error.name = "AbortError";
  return error;
}

function pendingKey(runId: string, requestId: string): string {
  return `${runId}\u0000${requestId}`;
}

/** A draw selection picks exactly one candidate, or `reject`, plus a note. */
function validateDrawAnswer(
  draw: AgentUserInputDraw,
  response: SessionUserInputResponsePayload
): void {
  const answer = response.answers[0];
  const selected = answer?.selectedOptionIds ?? [];
  const allowed = new Set([
    ...draw.candidates.map((candidate) => candidate.id),
    SUBAGENT_DRAW_REJECT_OPTION_ID
  ]);
  if (
    response.answers.length !== 1 ||
    answer?.id !== SUBAGENT_DRAW_QUESTION_ID ||
    selected.length !== 1 ||
    !allowed.has(selected[0]!)
  ) {
    throw new UserInputResolutionError(
      "agent.user_input_invalid_answer",
      "抽卡选择必须选定一份候选，或选择都不采用。"
    );
  }
}

function validateAnswers(
  questions: readonly AgentUserInputQuestion[],
  response: SessionUserInputResponsePayload
): void {
  const answerById = new Map(
    response.answers.map((answer) => [answer.id, answer])
  );
  if (
    answerById.size !== response.answers.length ||
    answerById.size !== questions.length
  ) {
    throw new UserInputResolutionError(
      "agent.user_input_answer_mismatch",
      "回答必须与待处理问题一一对应。"
    );
  }

  for (const question of questions) {
    const answer = answerById.get(question.id);
    if (!answer) {
      throw new UserInputResolutionError(
        "agent.user_input_answer_mismatch",
        `缺少问题 ${question.id} 的回答。`
      );
    }
    const selected = answer.selectedOptionIds ?? [];
    const text = answer.text?.trim() ?? "";
    if (!question.options) {
      if (selected.length > 0 || !text) {
        throw new UserInputResolutionError(
          "agent.user_input_invalid_answer",
          `问题 ${question.id} 需要填写文本回答。`
        );
      }
      continue;
    }

    const allowedOptionIds = new Set(
      question.options.map((option) => option.id)
    );
    if (selected.some((optionId) => !allowedOptionIds.has(optionId))) {
      throw new UserInputResolutionError(
        "agent.user_input_invalid_option",
        `问题 ${question.id} 包含未知选项。`
      );
    }
    if (question.multi_select !== true && selected.length > 1) {
      throw new UserInputResolutionError(
        "agent.user_input_invalid_answer",
        `问题 ${question.id} 只能选择一个选项。`
      );
    }
    if (selected.length === 0 && !text) {
      throw new UserInputResolutionError(
        "agent.user_input_invalid_answer",
        `问题 ${question.id} 尚未作答。`
      );
    }
  }
}

export class AgentUserInputBroker {
  private readonly pending = new Map<string, PendingUserInput>();
  private readonly pendingRequestByRun = new Map<string, string>();

  wait(
    request: {
      sessionId: string;
      runId: string;
      requestId: string;
      questions: AgentUserInputQuestion[];
      draw?: AgentUserInputDraw;
    },
    signal?: AbortSignal
  ): Promise<SessionUserInputResponsePayload> {
    const questions = AgentUserInputQuestionsSchema.parse(request.questions);
    const draw = request.draw
      ? AgentUserInputDrawSchema.parse(request.draw)
      : undefined;
    if (signal?.aborted) throw abortedError();
    if (this.pendingRequestByRun.has(request.runId)) {
      throw new UserInputResolutionError(
        "agent.user_input_already_pending",
        "当前智能体运行已有一个问题等待用户回答。"
      );
    }

    return new Promise((resolve, reject) => {
      const key = pendingKey(request.runId, request.requestId);
      const pending: PendingUserInput = {
        request: { ...request, questions, ...(draw ? { draw } : {}) },
        resolve,
        reject,
        ...(signal ? { signal } : {})
      };
      if (signal) {
        pending.abortListener = () => {
          this.remove(key, pending);
          reject(abortedError());
        };
        signal.addEventListener("abort", pending.abortListener, { once: true });
      }
      this.pending.set(key, pending);
      this.pendingRequestByRun.set(request.runId, request.requestId);
    });
  }

  resolve(
    rawResponse: SessionUserInputResponsePayload
  ): SessionUserInputResponseAcceptedPayload {
    const response = SessionUserInputResponsePayloadSchema.parse(rawResponse);
    const key = pendingKey(response.runId, response.requestId);
    const pending = this.pending.get(key);
    if (!pending) {
      throw new UserInputResolutionError(
        "agent.user_input_not_pending",
        "这项用户确认已处理、已取消或不再有效。"
      );
    }
    if (pending.request.sessionId !== response.sessionId) {
      throw new UserInputResolutionError(
        "agent.user_input_session_mismatch",
        "用户回答不属于当前智能体会话。"
      );
    }
    if (pending.request.draw) {
      validateDrawAnswer(pending.request.draw, response);
    } else {
      validateAnswers(pending.request.questions, response);
    }
    this.remove(key, pending);
    pending.resolve(response);
    return SessionUserInputResponseAcceptedPayloadSchema.parse({
      sessionId: response.sessionId,
      runId: response.runId,
      requestId: response.requestId,
      resolvedAt: new Date().toISOString()
    });
  }

  cancelRun(runId: string): void {
    const requestId = this.pendingRequestByRun.get(runId);
    if (!requestId) return;
    const key = pendingKey(runId, requestId);
    const pending = this.pending.get(key);
    if (!pending) return;
    this.remove(key, pending);
    pending.reject(abortedError());
  }

  private remove(key: string, pending: PendingUserInput): void {
    this.pending.delete(key);
    if (
      this.pendingRequestByRun.get(pending.request.runId) ===
      pending.request.requestId
    ) {
      this.pendingRequestByRun.delete(pending.request.runId);
    }
    if (pending.signal && pending.abortListener) {
      pending.signal.removeEventListener("abort", pending.abortListener);
    }
  }
}
