import { describe, expect, it } from "vitest";
import {
  CommandEnvelopeSchema,
  StorageChangeResultSchema,
  StorageSettingsSnapshotSchema,
  createEnvelope
} from "./index";

describe("storage settings contracts", () => {
  it("requires current and default locations without exposing extra configuration", () => {
    const snapshot = {
      userData: {
        path: "/storage/custom",
        defaultPath: "/storage/default",
        isDefault: false
      },
      workspace: {
        path: "/workspace/default",
        defaultPath: "/workspace/default",
        isDefault: true
      }
    };
    expect(StorageSettingsSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(
      StorageSettingsSnapshotSchema.safeParse({
        ...snapshot,
        userData: { ...snapshot.userData, defaultPath: "" }
      }).success
    ).toBe(false);
    expect(
      StorageSettingsSnapshotSchema.safeParse({
        ...snapshot,
        credentials: "invalid-placeholder"
      }).success
    ).toBe(false);
    expect(
      StorageChangeResultSchema.safeParse({ restarting: "yes" }).success
    ).toBe(false);
  });

  it.each([
    "storageSettings.get",
    "storageSettings.chooseUserData",
    "storageSettings.resetUserData",
    "storageSettings.resetWorkspaceDirectory"
  ])(
    "registers %s and prevents renderer-supplied destination paths",
    (type) => {
      expect(
        CommandEnvelopeSchema.parse(
          createEnvelope(type, {}, { id: "storage_settings_test" })
        ).type
      ).toBe(type);
      expect(
        CommandEnvelopeSchema.safeParse(
          createEnvelope(
            type,
            { path: "/unapproved/destination" },
            { id: "storage_settings_test" }
          )
        ).success
      ).toBe(false);
    }
  );

  it("only opens the two authorized storage locations", () => {
    for (const kind of ["user-data", "workspace"]) {
      expect(
        CommandEnvelopeSchema.parse(
          createEnvelope(
            "storageSettings.openDirectory",
            { kind },
            { id: "storage_settings_test" }
          )
        ).payload
      ).toEqual({ kind });
    }
    for (const payload of [
      { kind: "/arbitrary/path" },
      { kind: "workspace", path: "/arbitrary/path" },
      {}
    ]) {
      expect(
        CommandEnvelopeSchema.safeParse(
          createEnvelope("storageSettings.openDirectory", payload, {
            id: "storage_settings_test"
          })
        ).success
      ).toBe(false);
    }
  });
});
