import { effectScope, nextTick, ref, shallowRef } from "vue";
import { describe, expect, it } from "vitest";
import type { ResourceTreeNode } from "../types/workspace";
import { useTreeNodeDisclosure } from "./useTreeNodeDisclosure";

describe("useTreeNodeDisclosure", () => {
  it("keeps a manually collapsed selected book closed when its tree refreshes", async () => {
    const node = shallowRef<ResourceTreeNode>({
      id: "long-book",
      label: "长篇",
      selectableBranch: true,
      children: [{ id: "chapter-1", label: "第一章" }]
    });
    const selectedId = ref("long-book");
    const scope = effectScope();
    const { open } = scope.run(() =>
      useTreeNodeDisclosure(
        () => node.value,
        () => selectedId.value
      )
    )!;

    expect(open.value).toBe(true);
    open.value = false;
    node.value = {
      ...node.value,
      children: [{ id: "chapter-1", label: "第一章（已刷新）" }]
    };
    await nextTick();
    expect(open.value).toBe(false);

    node.value = {
      ...node.value,
      children: [...node.value.children!, { id: "chapter-2", label: "第二章" }]
    };
    await nextTick();
    expect(open.value).toBe(false);

    selectedId.value = "short-document";
    await nextTick();
    expect(open.value).toBe(false);

    selectedId.value = "long-book";
    await nextTick();
    expect(open.value).toBe(true);
    scope.stop();
  });

  it("reveals a selected descendant when it appears or the selection changes", async () => {
    const node = shallowRef<ResourceTreeNode>({
      id: "book",
      label: "作品",
      children: [{ id: "other", label: "其他" }]
    });
    const selectedId = ref("chapter-1");
    const scope = effectScope();
    const { open } = scope.run(() =>
      useTreeNodeDisclosure(
        () => node.value,
        () => selectedId.value
      )
    )!;

    expect(open.value).toBe(false);
    node.value = {
      ...node.value,
      children: [
        {
          id: "volume",
          label: "卷",
          children: [{ id: "chapter-1", label: "第一章" }]
        },
        { id: "chapter-2", label: "第二章" }
      ]
    };
    await nextTick();
    expect(open.value).toBe(true);

    open.value = false;
    selectedId.value = "chapter-2";
    await nextTick();
    expect(open.value).toBe(true);
    scope.stop();
  });
});
