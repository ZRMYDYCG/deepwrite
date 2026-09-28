import { describe, expect, it } from "vitest";
import source from "./WorkspaceDirectoryFeature.vue?raw";

describe("WorkspaceDirectoryFeature", () => {
  it("owns only the lightweight workspace-directory UI", () => {
    expect(source).toContain("这里决定以后新建和导入项目的默认位置");
    expect(source).toContain("long-book-analysis-sources");
    expect(source).toContain(':disabled="loading || !runtimeAvailable"');
    expect(source).toContain("@click=\"emit('choose')\"");
    expect(source).not.toContain("ModelSettings");
    expect(source).not.toContain("modelEditor");
    expect(source).not.toContain("listRemote");
  });
});
