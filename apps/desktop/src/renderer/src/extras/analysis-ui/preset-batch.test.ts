import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AnalysisProcessEntry } from "./analysis-process";
import { createPresetBatch } from "./preset-batch";
import {
  buildPresetRunners,
  errorCodeOf,
  type PresetRunStatus
} from "./preset-runner";

interface Result {
  name: string;
}

function fakeRunner() {
  const status = ref<PresetRunStatus>("idle");
  const result = ref<Result | null>(null);
  const error = ref<string | null>(null);
  let code: string | undefined;
  return {
    status,
    result,
    error,
    entries: ref<AnalysisProcessEntry[]>([]),
    activity: ref(""),
    liveOutput: ref(""),
    errorCode: () => code,
    start: vi.fn(() => {
      status.value = "running";
    }),
    retry: vi.fn(() => {
      status.value = "running";
    }),
    stop: vi.fn(async () => {
      status.value = "stopped";
    }),
    handleEvent: vi.fn(),
    dispose: vi.fn(),
    complete(name: string) {
      result.value = { name };
      status.value = "completed";
    },
    fail(message: string, errorCode?: string) {
      code = errorCode;
      error.value = message;
      status.value = "error";
    }
  };
}

function setup(count: number, concurrency = 3) {
  const presets = Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `预设${index + 1}`
  }));
  const runners = presets.map(() => fakeRunner());
  const batch = createPresetBatch<(typeof presets)[number], Result>({
    concurrency,
    label: (preset) => preset.name
  });
  batch.start(
    presets.map((preset, index) => ({ preset, runner: runners[index]! })),
    "测试来源"
  );
  return { batch, runners, presets };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("preset batch", () => {
  it("runs at most three presets at once and keeps results in selection order", () => {
    const { batch, runners } = setup(5);
    expect(runners.map((runner) => runner.start.mock.calls.length)).toEqual([
      1, 1, 1, 0, 0
    ]);
    expect(batch.counts.value).toMatchObject({ running: 3, queued: 2 });
    expect(batch.status.value).toBe("running");
    expect(batch.context.value).toBe("测试来源");

    runners[1]!.complete("第二份");
    expect(runners[3]!.start).toHaveBeenCalledOnce();
    expect(batch.results.value.map((entry) => entry.id)).toEqual(["p2"]);

    runners[0]!.fail("模型失败");
    expect(runners[4]!.start).toHaveBeenCalledOnce();
    expect(batch.error.value).toBe("预设1：模型失败");

    runners[2]!.complete("第三份");
    runners[3]!.complete("第四份");
    runners[4]!.complete("第五份");
    expect(batch.status.value).toBe("partial");
    expect(batch.isBusy.value).toBe(false);
    expect(batch.canRetry.value).toBe(true);
    expect(batch.endedAt.value).not.toBeNull();

    expect(batch.retryFailed()).toBe(true);
    expect(runners[0]!.retry).toHaveBeenCalledOnce();
    expect(batch.error.value).toBeNull();
    runners[0]!.complete("第一份");
    expect(batch.status.value).toBe("completed");
    expect(batch.results.value.map((entry) => entry.result.name)).toEqual([
      "第一份",
      "第二份",
      "第三份",
      "第四份",
      "第五份"
    ]);
  });

  it("queues a preset again when the Agent Utility has no free slot", () => {
    vi.useFakeTimers();
    const { batch, runners } = setup(2);
    runners[0]!.fail("容量已满", "agent.extras_capacity_reached");
    expect(batch.items.value[0]).toMatchObject({
      state: "queued",
      waiting: true
    });
    expect(batch.status.value).toBe("running");
    expect(batch.error.value).toBeNull();

    vi.advanceTimersByTime(2999);
    expect(runners[0]!.retry).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(runners[0]!.retry).toHaveBeenCalledOnce();
    expect(batch.items.value[0]?.state).toBe("running");

    runners[0]!.fail("容量已满", "agent.capacity_reached");
    runners[1]!.complete("完成");
    expect(runners[0]!.retry).toHaveBeenCalledTimes(2);
  });

  it("stops running presets, cancels queued ones and starts a cancelled one fresh", async () => {
    const { batch, runners } = setup(2, 1);
    await batch.stop();
    expect(runners[0]!.stop).toHaveBeenCalledOnce();
    expect(batch.items.value.map((item) => item.state)).toEqual([
      "stopped",
      "stopped"
    ]);
    expect(batch.status.value).toBe("stopped");

    expect(batch.retryItem("p2")).toBe(true);
    expect(runners[1]!.start).toHaveBeenCalledOnce();
    expect(runners[1]!.retry).not.toHaveBeenCalled();
    await batch.stopItem("p2");
    expect(runners[1]!.stop).toHaveBeenCalledOnce();

    expect(batch.retryItem("p1")).toBe(true);
    expect(runners[0]!.retry).toHaveBeenCalledOnce();
  });

  it("drops unfinished tasks when inputs change and keeps completed results", () => {
    const { batch, runners } = setup(2);
    expect(() => batch.settle()).toThrow();
    expect(() => batch.start([], "")).toThrow();
    runners[0]!.complete("保留");
    runners[1]!.fail("失败");
    batch.settle();
    expect(batch.items.value).toEqual([]);
    expect(batch.tasksVisible.value).toBe(false);
    expect(batch.status.value).toBe("idle");
    expect(runners[1]!.dispose).toHaveBeenCalledOnce();
    expect(batch.results.value.map((entry) => entry.result.name)).toEqual([
      "保留"
    ]);

    batch.updateResult("p1", { name: "已编辑" });
    expect(batch.unsavedCount.value).toBe(1);
    batch.markSaved("p1");
    expect(batch.unsavedCount.value).toBe(0);
    expect(batch.results.value[0]?.result.name).toBe("已编辑");

    batch.clear();
    expect(batch.results.value).toEqual([]);
  });

  it("forwards events and disposes every runner", () => {
    const { batch, runners } = setup(2);
    const event = { type: "agent.message_delta", payload: {} } as never;
    batch.handleEvent(event);
    expect(
      runners.every((runner) => runner.handleEvent.mock.calls.length)
    ).toBe(true);
    batch.dispose();
    expect(runners.every((runner) => runner.dispose.mock.calls.length)).toBe(
      true
    );
  });

  it("refuses the whole analysis when one preset cannot start", () => {
    const built = fakeRunner();
    expect(() =>
      buildPresetRunners(
        [{ name: "剧情" }, { name: "人物" }],
        (preset) => preset.name,
        (preset) => {
          if (preset.name === "人物") throw new Error("超出上下文");
          return built;
        }
      )
    ).toThrow("人物");
    expect(built.dispose).toHaveBeenCalledOnce();
  });

  it("finds payload codes through wrapped causes", () => {
    const payload = { code: "agent.extras_capacity_reached", message: "满" };
    const wrapped = new Error("阶段失败", {
      cause: new Error("", { cause: payload })
    });
    expect(errorCodeOf(wrapped)).toBe("agent.extras_capacity_reached");
    expect(errorCodeOf(new Error("普通错误"))).toBeUndefined();
  });
});
