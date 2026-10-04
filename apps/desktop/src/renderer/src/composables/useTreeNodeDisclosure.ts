import { computed, ref, watch, type Ref } from "vue";
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
  selectedId: () => string,
  options: {
    initialOpen?: boolean;
    selectionActive?: Readonly<Ref<boolean>>;
  } = {}
) {
  const open = ref(options.initialOpen ?? false);
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
    [
      selectedId,
      containsSelection,
      () => options.selectionActive?.value ?? true
    ],
    ([, contains, active]) => {
      if (contains && active) open.value = true;
    },
    { immediate: true }
  );

  return { open };
}
