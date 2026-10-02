import { effectScope, shallowRef } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { ConversationHistoryItem } from "../types/conversation";
import {
  createConversationHistoryManagement,
  type ConversationHistoryManagementPort
} from "./useConversationHistoryManagement";

const item: ConversationHistoryItem = {
  sessionId: "session-a",
  title: "测试对话",
  preview: "测试正文",
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:00:00.000Z",
  messageCount: 2,
  turnCount: 1,
  current: false
};

function setup() {
  const port = {
    historyManagementAvailable: true,
    deleteConversation: vi.fn(async () => true)
  };
  const owner = shallowRef<ConversationHistoryManagementPort | undefined>(port);
  const notify = vi.fn();
  const scope = effectScope();
  const state = scope.run(() =>
    createConversationHistoryManagement({ owner: () => owner.value, notify })
  )!;
  return { state, port, owner, notify, dispose: () => scope.stop() };
}

describe("conversation archive presentation", () => {
  it("requires a durable management backend", async () => {
    const test = setup();
    test.owner.value = undefined;
    expect(test.state.available.value).toBe(false);
    expect(await test.state.archiveConversation(item)).toBe(false);
    expect(test.port.deleteConversation).not.toHaveBeenCalled();
    test.dispose();
  });

  it("waits for the archive acknowledgement and prevents duplicate actions", async () => {
    const test = setup();
    let acknowledge: ((value: boolean) => void) | undefined;
    test.port.deleteConversation.mockImplementation(
      () => new Promise<boolean>((resolve) => (acknowledge = resolve))
    );
    const archive = test.state.archiveConversation(item);
    expect(test.state.busy.value).toBe(true);
    expect(await test.state.archiveConversation(item)).toBe(false);
    expect(test.notify).not.toHaveBeenCalled();
    acknowledge!(true);
    expect(await archive).toBe(true);
    expect(test.port.deleteConversation).toHaveBeenCalledOnce();
    expect(test.notify).toHaveBeenCalledWith(
      "success",
      "对话已归档，可在设置中恢复。"
    );
    test.dispose();
  });

  it("reports refused and failed archives without claiming success", async () => {
    const test = setup();
    test.port.deleteConversation.mockResolvedValueOnce(false);
    expect(await test.state.archiveConversation(item)).toBe(false);
    expect(test.notify).toHaveBeenLastCalledWith(
      "info",
      "请先完成或停止当前回复，再管理对话。"
    );
    test.port.deleteConversation.mockRejectedValueOnce(
      new Error("测试：仍有待处理提案")
    );
    expect(await test.state.archiveConversation(item)).toBe(false);
    expect(test.notify).toHaveBeenLastCalledWith(
      "error",
      "测试：仍有待处理提案"
    );
    expect(test.state.busy.value).toBe(false);
    test.dispose();
  });
});
