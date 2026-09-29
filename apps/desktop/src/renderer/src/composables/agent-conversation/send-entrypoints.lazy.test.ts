import { computed, ref } from "vue";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { LongWorkspaceRuntimeContext } from "@deepwrite/contracts";
import { initializeTestTranslations } from "../../../../test-utils/rendererI18n";
import type { ChatMessage } from "../../types/conversation";
import type { AgentConversationContext } from "./context";

let release: () => void;
let fail: (reason: Error) => void;
let entrypoints: typeof import("./send-entrypoints");
let validate: ReturnType<
  typeof vi.fn<
    (context: LongWorkspaceRuntimeContext) => LongWorkspaceRuntimeContext
  >
>;

beforeEach(async () => {
  vi.resetModules();
  await initializeTestTranslations();
  const loaded = new Promise<void>((resolve, reject) => {
    release = resolve;
    fail = reject;
  });
  validate = vi.fn((context) => context);
  vi.doMock("./long-runtime-validation", async () => {
    await loaded;
    return { validateLongRuntimeContext: validate };
  });
  entrypoints = await import("./send-entrypoints");
});
afterEach(() => vi.doUnmock("./long-runtime-validation"));

function fixture() {
  const submitting = ref(false);
  const sendMessage = vi.fn<AgentConversationContext["sendMessage"]>(
    async () => {
      submitting.value = true;
    }
  );
  const state = {
    epoch: 1,
    sessionId: ref("session_1"),
    draft: ref("Review this chapter"),
    messages: ref<ChatMessage[]>([]),
    submitting,
    isBusy: computed(() => submitting.value),
    sendMessage
  };
  return {
    state,
    ctx: state as unknown as AgentConversationContext,
    sendMessage
  };
}
const runtime = () =>
  ({
    bookId: "book_1",
    title: "Original title"
  }) as LongWorkspaceRuntimeContext;

describe("lazy long-form send validation", () => {
  it("reserves the send while loading, snapshots context, and transfers pending ownership", async () => {
    const { ctx, state, sendMessage } = fixture();
    const context = runtime();
    const pending = entrypoints.sendLongMessage(ctx, context);
    expect(state.submitting.value).toBe(true);
    await entrypoints.sendLongMessage(ctx, context);
    expect(sendMessage).not.toHaveBeenCalled();
    context.title = "Changed after submission";
    release();
    await pending;
    expect(validate).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toMatchObject({
      title: "Original title"
    });
    expect(state.submitting.value).toBe(true);
  });

  it.each(["session", "dispose", "draft"] as const)(
    "does not send after the %s changes while loading",
    async (change) => {
      const { ctx, state, sendMessage } = fixture();
      const pending = entrypoints.sendLongMessage(ctx, runtime());
      if (change === "session") state.sessionId.value = "session_2";
      else if (change === "dispose") state.epoch += 1;
      else state.draft.value = "A newer draft";
      release();
      await pending;
      expect(sendMessage).not.toHaveBeenCalled();
      expect(state.draft.value).toBe(
        change === "draft" ? "A newer draft" : "Review this chapter"
      );
      if (change === "draft") expect(state.submitting.value).toBe(false);
      else expect(state.submitting.value).toBe(true); // A newer owner is never cleared.
    }
  );

  it("releases its reservation when loading fails without consuming the draft", async () => {
    const { ctx, state, sendMessage } = fixture();
    const pending = entrypoints.sendLongMessage(ctx, runtime());
    const rejected = expect(pending).rejects.toMatchObject({
      cause: { message: "Module unavailable" }
    });
    fail(new Error("Module unavailable"));
    await rejected;
    expect(sendMessage).not.toHaveBeenCalled();
    expect(state.submitting.value).toBe(false);
    expect(state.draft.value).toBe("Review this chapter");
  });

  it("does not dispatch invalid context and releases its reservation", async () => {
    const { ctx, state, sendMessage } = fixture();
    validate.mockImplementation(() => {
      throw new Error("Invalid runtime context");
    });
    const pending = entrypoints.sendLongMessage(ctx, runtime());
    const rejected = expect(pending).rejects.toThrow("Invalid runtime context");
    release();
    await rejected;
    expect(sendMessage).not.toHaveBeenCalled();
    expect(state.submitting.value).toBe(false);
  });
});
