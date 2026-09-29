import { effectScope, nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  VoiceApi,
  VoiceSettings,
  VoiceTranscribeInput,
  VoiceTranscribeResult
} from "@deepwrite/contracts/renderer";
import { useVoiceInput } from "./useVoiceInput";
import type { VoiceRecorderOptions } from "../utils/voiceRecorder";

vi.mock("../ui-feedback", () => ({ uiMessage: { error: vi.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function settings(): VoiceSettings {
  return {
    activeProfileId: "mimo-api",
    language: "auto",
    microphoneId: "test-microphone",
    profiles: [
      "mimo-token-plan",
      "mimo-api",
      "aliyun-token-plan",
      "aliyun-api"
    ].map((id) => ({
      id: id as VoiceSettings["activeProfileId"],
      baseUrl: "https://asr.example.test",
      model: "test-asr",
      hasApiKey: true
    }))
  };
}

function result(
  input: VoiceTranscribeInput,
  text = "识别文字"
): VoiceTranscribeResult {
  return {
    text,
    requestId: input.requestId,
    profileId: input.profileId,
    usage: {
      requestId: input.requestId,
      profileId: input.profileId,
      model: "test-asr",
      createdAt: "2026-01-01T00:00:00.000Z",
      durationMs: 1_000
    }
  };
}

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
  vi.unstubAllGlobals();
});

function setup() {
  const draft = ref("原有草稿");
  const session = ref("first");
  const canSend = ref(true);
  const inputElement = {
    selectionStart: 2,
    selectionEnd: 2,
    focus: vi.fn(),
    setSelectionRange: vi.fn()
  };
  const api: VoiceApi = {
    getSettings: vi.fn(async () => settings()),
    saveSettings: vi.fn(async () => settings()),
    getUsage: vi.fn(async () => []),
    transcribe: vi.fn(async (input) => result(input)),
    cancel: vi.fn(async () => undefined),
    requestMicrophoneAccess: vi.fn(async () => true)
  };
  const recorder = {
    stop: vi.fn(() => ({ audioBase64: "test-audio", durationMs: 1_000 })),
    cancel: vi.fn()
  };
  const createRecorder = vi.fn(
    async (_options: VoiceRecorderOptions) => recorder
  );
  const send = vi.fn();
  const scope = effectScope();
  scopes.push(scope);
  const voice = scope.run(() =>
    useVoiceInput(
      {
        sessionKey: () => session.value,
        draft: () => draft.value,
        input: ref(inputElement as unknown as HTMLTextAreaElement),
        updateDraft: (text) => {
          draft.value = text;
        },
        canSend: () => canSend.value && !!draft.value.trim(),
        send
      },
      { api, createRecorder }
    )
  )!;
  return {
    voice,
    draft,
    session,
    canSend,
    inputElement,
    api,
    recorder,
    createRecorder,
    send,
    scope
  };
}

describe("voice input flow", () => {
  it("stops recording, inserts at the saved caret, and leaves sending to the user", async () => {
    const context = setup();
    await context.voice.start();
    expect(context.voice.state.value).toBe("recording");
    expect(context.createRecorder.mock.calls[0]?.[0].microphoneId).toBe(
      "test-microphone"
    );
    await context.voice.stop();
    expect(context.draft.value).toBe("原有识别文字草稿");
    expect(context.inputElement.setSelectionRange).toHaveBeenCalledWith(6, 6);
    expect(context.recorder.stop).toHaveBeenCalledOnce();
    expect(context.recorder.cancel).toHaveBeenCalledOnce();
    expect(context.createRecorder.mock.calls[0]?.[0].signal.aborted).toBe(true);
    expect(context.send).not.toHaveBeenCalled();
    expect(context.voice.active.value).toBe(false);
  });

  it("replaces a selection and sends only after the draft update has reached the next tick", async () => {
    const context = setup();
    context.inputElement.selectionStart = 0;
    context.inputElement.selectionEnd = 4;
    context.send.mockImplementation(() =>
      expect(context.draft.value).toBe("识别文字")
    );
    await context.voice.start();
    await context.voice.stopAndSend();
    expect(context.send).toHaveBeenCalledOnce();
  });

  it("keeps the transcription as a draft when the conversation cannot send anymore", async () => {
    const context = setup();
    await context.voice.start();
    context.canSend.value = false;
    await context.voice.stopAndSend();
    expect(context.draft.value).toContain("识别文字");
    expect(context.send).not.toHaveBeenCalled();
  });

  it("cancel leaves the original draft intact and releases the recording", async () => {
    const context = setup();
    await context.voice.start();
    context.voice.cancel();
    expect(context.draft.value).toBe("原有草稿");
    expect(context.recorder.cancel).toHaveBeenCalledOnce();
    expect(context.api.transcribe).not.toHaveBeenCalled();
    expect(context.voice.active.value).toBe(false);
  });

  it("retains failed audio in memory for retry without sending automatically", async () => {
    const context = setup();
    vi.mocked(context.api.transcribe).mockRejectedValueOnce(
      new Error("临时失败")
    );
    await context.voice.start();
    await context.voice.stopAndSend();
    expect(context.voice.canRetry.value).toBe(true);
    expect(context.draft.value).toBe("原有草稿");
    expect(context.send).not.toHaveBeenCalled();
    await context.voice.retry();
    const calls = vi.mocked(context.api.transcribe).mock.calls;
    expect(calls[0]?.[0].audioBase64).toBe(calls[1]?.[0].audioBase64);
    expect(calls[0]?.[0].requestId).not.toBe(calls[1]?.[0].requestId);
    expect(context.draft.value).toContain("识别文字");
    expect(context.send).not.toHaveBeenCalled();
  });

  it("cancels an in-flight request and never inserts its late result into a new session", async () => {
    const context = setup();
    const pending = deferred<VoiceTranscribeResult>();
    vi.mocked(context.api.transcribe).mockReturnValue(pending.promise);
    await context.voice.start();
    const stopping = context.voice.stopAndSend();
    const sent = vi.mocked(context.api.transcribe).mock.calls[0]![0];
    context.session.value = "second";
    context.draft.value = "新会话草稿";
    pending.resolve(result(sent));
    await stopping;
    expect(context.api.cancel).toHaveBeenCalledWith({
      requestId: sent.requestId
    });
    expect(context.draft.value).toBe("新会话草稿");
    expect(context.send).not.toHaveBeenCalled();
  });

  it("preserves an external draft change while recognition is pending", async () => {
    const context = setup();
    const pending = deferred<VoiceTranscribeResult>();
    vi.mocked(context.api.transcribe).mockReturnValue(pending.promise);
    await context.voice.start();
    const stopping = context.voice.stop();
    context.draft.value = "后续编辑";
    pending.resolve(
      result(vi.mocked(context.api.transcribe).mock.calls[0]![0])
    );
    await stopping;
    expect(context.draft.value).toBe("后续编辑识别文字");
  });

  it("releases a microphone acquired after cancellation", async () => {
    const context = setup();
    const pending = deferred<typeof context.recorder>();
    context.createRecorder.mockReturnValue(pending.promise);
    const starting = context.voice.start();
    await nextTick();
    await nextTick();
    expect(context.createRecorder).toHaveBeenCalledOnce();
    context.voice.cancel();
    pending.resolve(context.recorder);
    await starting;
    expect(context.recorder.cancel).toHaveBeenCalledOnce();
    expect(context.voice.active.value).toBe(false);
  });

  it("does not request microphone access until the selected profile has a saved key", async () => {
    const context = setup();
    const missing = settings();
    missing.profiles.forEach((profile) => {
      profile.hasApiKey = false;
    });
    vi.mocked(context.api.getSettings).mockResolvedValue(missing);
    await context.voice.start();
    expect(context.api.requestMicrophoneAccess).not.toHaveBeenCalled();
    expect(context.createRecorder).not.toHaveBeenCalled();
    expect(context.voice.active.value).toBe(false);
  });

  it("releases recording when disposed and when a second input starts", async () => {
    const first = setup();
    const second = setup();
    await first.voice.start();
    await second.voice.start();
    expect(first.recorder.cancel).toHaveBeenCalledOnce();
    expect(first.voice.active.value).toBe(false);
    second.scope.stop();
    expect(second.recorder.cancel).toHaveBeenCalledOnce();
  });

  it("cancels recording when the window becomes hidden and removes lifecycle listeners on disposal", async () => {
    const documentEvents = Object.assign(new EventTarget(), { hidden: false });
    const windowEvents = new EventTarget();
    vi.stubGlobal("document", documentEvents);
    vi.stubGlobal("window", windowEvents);
    const context = setup();
    await context.voice.start();
    documentEvents.hidden = true;
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    expect(context.recorder.cancel).toHaveBeenCalledOnce();
    expect(context.voice.active.value).toBe(false);
    await context.voice.start();
    windowEvents.dispatchEvent(new Event("pagehide"));
    expect(context.recorder.cancel).toHaveBeenCalledTimes(2);
    const removeDocumentListener = vi.spyOn(
      documentEvents,
      "removeEventListener"
    );
    const removeWindowListener = vi.spyOn(windowEvents, "removeEventListener");
    context.scope.stop();
    expect(removeDocumentListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    );
    expect(removeWindowListener).toHaveBeenCalledWith(
      "pagehide",
      expect.any(Function)
    );
  });
});
