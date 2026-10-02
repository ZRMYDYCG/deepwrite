import { computed, ref, watch } from "vue";
import type { ResourceTreeNode } from "../types/workspace";

function containsSelectedDescendant(
  node: ResourceTreeNode,
  selectedId: string
): boolean {
  return (node.children ?? []).some(
    (child) =>
      child.id === selectedId || containsSelectedDescendant(child, selectedId)
  );
}

export function useTreeNodeDisclosure(
  node: () => ResourceTreeNode,
  selectedId: () => string
) {
  const open = ref(false);
  const containsSelection = computed(() => {
    const current = node();
    const selection = selectedId();
    return Boolean(
      selection &&
      current.children?.length &&
      ((current.selectableBranch && current.id === selection) ||
        containsSelectedDescendant(current, selection))
    );
  });

  watch(
    [selectedId, containsSelection],
    ([, contains]) => {
      if (contains) open.value = true;
    },
    { immediate: true }
  );

  return { open };
}
