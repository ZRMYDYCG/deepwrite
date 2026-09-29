import { expect, test } from "vitest";
import type { SyncProgress, SyncStatus } from "@deepwrite/contracts/renderer";
import { syncProgressPresentation } from "./progressPresentation";

function status(progress: SyncProgress): SyncStatus {
  return {
    config: null,
    credentialSaved: false,
    deviceId: "test-device",
    firstSyncConfirmed: true,
    lastCheckedAt: null,
    lastSuccessAt: null,
    items: [],
    issues: [],
    devices: [],
    history: [],
    progress
  };
}

test("unknown totals and preparation do not display fabricated progress", () => {
  for (const phase of ["saving", "checking", "transferring"] as const) {
    const view = syncProgressPresentation(
      status({ phase, title: "检查", completed: 0, total: 0 }),
      true
    );
    expect(view.determinate).toBe(false);
    expect(view.count).toBe("请稍候");
    expect(view.percent).toBe(0);
  }
  const view = syncProgressPresentation(
    status({ phase: "checking", title: "检查", completed: 9, total: 10 }),
    true
  );
  expect(view.determinate).toBe(false);
});

test.each(["uploading", "downloading"] as const)(
  "separates %s stages from unbounded work titles",
  (prefix) => {
    const longTitle = "很长的作品名称".repeat(30);
    const view = syncProgressPresentation(
      status({
        phase: "transferring",
        title: longTitle,
        titleText: { code: prefix, params: { title: longTitle } },
        completed: 2,
        total: 3,
        filesCompleted: 10,
        filesTotal: 20
      }),
      true
    );
    expect(view.stage).toBe(
      prefix === "uploading" ? "正在上传本机修改" : "正在下载远端更新"
    );
    expect(view.detail).toContain(longTitle);
    expect(view.count).toBe("2 / 3 项");
    expect(view.percent).toBeCloseTo(66.67, 2);
    expect(view.secondary).toBe("当前作品文件 10 / 20");
  }
);

test("a partial or failed operation is never presented as fully successful", () => {
  const partial = syncProgressPresentation(
    status({ phase: "partial", title: "1 项未完成", completed: 2, total: 3 }),
    false
  );
  expect(partial.badge).toBe("待处理");
  expect(partial.count).toBe("2 / 3 项");
  const failed = syncProgressPresentation(
    status({
      phase: "failed",
      title: "同步未完成，请重试",
      completed: 2,
      total: 3
    }),
    false
  );
  expect(failed.badge).toBe("未完成");
  expect(failed.determinate).toBe(false);
  expect(failed.detail).toBe("同步未完成，请重试");
});

test("first-sync preview remains a confirmation step with no transfer progress", () => {
  const initial = status({
    phase: "partial",
    title: "确认首次同步内容",
    completed: 0,
    total: 0
  });
  initial.firstSyncConfirmed = false;
  initial.issues = [
    {
      key: "__first__",
      title: "首次同步预览",
      token: "__first__",
      reason: "first-sync",
      message: "请确认",
      paths: [],
      local: null,
      versions: []
    }
  ];
  const view = syncProgressPresentation(initial, false);
  expect(view.badge).toBe("待确认");
  expect(view.stage).toBe("请确认首次同步内容");
  expect(view.determinate).toBe(false);
});
