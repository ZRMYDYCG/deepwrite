import { describe, expect, it, vi } from "vitest";
import { ipcRenderer } from "electron";
import { createEnvelope } from "@deepwrite/contracts";
import { invokeCommand } from "../preload/invoke";

vi.mock("electron", () => ({ ipcRenderer: { invoke: vi.fn() } }));

describe("validated preload command failures", () => {
  it.each(["request_1", "unknown"])(
    "preserves structured rejection data with result ID %s",
    async (requestId) => {
      const error = {
        code: "catalog.conflict",
        message: "original diagnostic",
        details: { expectedRevision: "before", actualRevision: "after" }
      };
      vi.mocked(ipcRenderer.invoke).mockResolvedValue({
        status: "rejected",
        requestId,
        error
      });
      await expect(
        invokeCommand(createEnvelope("system.health", {}, { id: "request_1" }))
      ).rejects.toEqual(error);
    }
  );

  it("still rejects a successful response with the wrong request ID", async () => {
    vi.mocked(ipcRenderer.invoke).mockResolvedValue({
      status: "accepted",
      requestId: "other_request",
      payload: {}
    });
    await expect(
      invokeCommand(createEnvelope("system.health", {}, { id: "request_1" }))
    ).rejects.toThrow("requestId does not match");
  });
});
