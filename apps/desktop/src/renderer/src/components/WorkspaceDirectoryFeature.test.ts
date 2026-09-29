import { describe, expect, it } from "vitest";
import source from "./WorkspaceDirectoryFeature.vue?raw";

describe("WorkspaceDirectoryFeature", () => {
  it("owns only the lightweight workspace-directory UI", () => {
    expect(source).toContain(
      "setTheDefaultLocationForFutureProjectCreationAnd"
    );
    expect(source).toContain("newBooksAndLegacyImportsGoInBooksMaterials");
    expect(source).toContain(':disabled="loading || !runtimeAvailable"');
    expect(source).toContain("@click=\"emit('choose')\"");
    expect(source).not.toContain("ModelSettings");
    expect(source).not.toContain("modelEditor");
    expect(source).not.toContain("listRemote");
  });
});
