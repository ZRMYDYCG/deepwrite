import { describe, expect, it } from "vitest";
import {
  approvalDiscardStatusLabel,
  approvalDiscardVisualStatus,
  shouldShowApprovalDiscardButton
} from "./approvalDiscardPresentation";

const updatedAt = "2026-08-25T00:00:00.000Z";

describe("approval discard presentation", () => {
  it("maps discard progress to the existing approval-card states", () => {
    expect(
      approvalDiscardStatusLabel({
        status: "discarding",
        message: "正在舍弃",
        updatedAt
      })
    ).toBe("正在撤销");
    expect(
      approvalDiscardVisualStatus({
        status: "discarded",
        message: "已舍弃",
        updatedAt
      })
    ).toBe("rejected");
  });

  it("shows the button only for eligible accepted edits not yet discarded", () => {
    expect(shouldShowApprovalDiscardButton(true, true, undefined)).toBe(true);
    expect(shouldShowApprovalDiscardButton(false, true, undefined)).toBe(false);
    expect(shouldShowApprovalDiscardButton(true, false, undefined)).toBe(false);
    expect(
      shouldShowApprovalDiscardButton(true, true, {
        status: "discarded",
        message: "已舍弃",
        updatedAt
      })
    ).toBe(false);
  });
});
