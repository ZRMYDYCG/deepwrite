import { describe, expect, it, vi } from "vitest";
import {
  createDefaultGeneralSettings,
  type GeneralSettingsSnapshot
} from "@deepwrite/contracts";
import { deferred, harness } from "./generalSettingsCoordinator.test-support";

describe("more features persistence", () => {
  it("applies changes immediately and ignores older replies while serializing rapid edits", async () => {
    const test = harness();
    const pending = deferred<GeneralSettingsSnapshot>();
    const save = vi.mocked(test.api!.save);
    save
      .mockImplementationOnce(() => pending.promise)
      .mockImplementation(async (settings) => ({ persisted: true, settings }));
    const hidden = test.settings.value.moreFeatures.map((entry) => ({
      ...entry,
      visible: false
    }));
    const reordered = [...hidden].reverse();
    test.coordinator.updateMoreFeatures(hidden);
    await Promise.resolve();
    test.coordinator.updateMoreFeatures(reordered);
    expect(test.settings.value.moreFeatures).toEqual(reordered);
    pending.resolve({
      persisted: true,
      settings: { ...test.settings.value, moreFeatures: hidden }
    });
    await test.coordinator.drain();
    expect(save).toHaveBeenCalledTimes(2);
    expect(test.settings.value.moreFeatures).toEqual(reordered);
    expect(save.mock.calls[0]![0].moreFeatures).toEqual(hidden);
    expect(save.mock.calls[1]![0].moreFeatures).toEqual(reordered);
  });

  it("preserves edits made during the initial read without overwriting unrelated preferences", async () => {
    const pending = deferred<GeneralSettingsSnapshot>();
    const test = harness({
      api: {
        list: () => pending.promise,
        save: vi.fn(async (settings) => ({ persisted: true, settings }))
      }
    });
    const loading = test.coordinator.load();
    const reordered = [...test.settings.value.moreFeatures].reverse();
    test.coordinator.updateMoreFeatures(reordered);
    pending.resolve({
      persisted: true,
      settings: { ...createDefaultGeneralSettings(), autoSave: false }
    });
    await loading;
    await test.coordinator.drain();
    expect(test.settings.value).toMatchObject({
      autoSave: false,
      moreFeatures: reordered
    });
  });

  it("restores the last saved configuration after a failure and supports subsequent edits", async () => {
    const test = harness();
    const save = vi.mocked(test.api!.save);
    save.mockImplementation(async (settings) => ({
      persisted: true,
      settings
    }));
    const reordered = [...test.settings.value.moreFeatures].reverse();
    test.coordinator.updateMoreFeatures(reordered);
    await test.coordinator.drain();
    save.mockRejectedValueOnce(new Error("disk unavailable"));
    test.coordinator.updateMoreFeatures(
      reordered.map((entry) => ({ ...entry, visible: false }))
    );
    expect(
      test.settings.value.moreFeatures.every(({ visible }) => !visible)
    ).toBe(true);
    await test.coordinator.drain();
    expect(test.settings.value.moreFeatures).toEqual(reordered);
    expect(test.warning).toHaveBeenCalledWith(
      expect.stringContaining("disk unavailable")
    );
    test.coordinator.updateMoreFeatures(
      createDefaultGeneralSettings().moreFeatures
    );
    await test.coordinator.drain();
    expect(test.settings.value.moreFeatures).toEqual(
      createDefaultGeneralSettings().moreFeatures
    );
  });

  it("keeps the latest choice when an earlier save fails and a later snapshot succeeds", async () => {
    const test = harness();
    const save = vi.mocked(test.api!.save);
    save
      .mockRejectedValueOnce(new Error("disk unavailable"))
      .mockImplementation(async (settings) => ({ persisted: true, settings }));
    const reordered = [...test.settings.value.moreFeatures].reverse();
    test.coordinator.updateMoreFeatures(reordered);
    test.coordinator.updateAutoSave(true);
    await test.coordinator.drain();
    expect(test.settings.value.moreFeatures).toEqual(reordered);
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ moreFeatures: reordered })
    );
  });
});
