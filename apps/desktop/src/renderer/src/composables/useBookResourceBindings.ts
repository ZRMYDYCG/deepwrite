import { createScopedTranslator } from "../i18n";
import { computed, reactive, ref, watch } from "vue";
import type {
  LinkedMaterialIdsByKind,
  LinkedSkillIdsByKind,
  MaterialKind,
  MaterialLibraryGroup,
  SkillKind,
  SkillLibraryGroup
} from "@deepwrite/contracts";
import type {
  BookResourceDialogMode,
  ResourceTreeNode
} from "../types/workspace";

const t = createScopedTranslator("workspace");

interface BookResourceBindingProps {
  mode: BookResourceDialogMode | null;
  book: ResourceTreeNode | null;
  materialLibraries: ResourceTreeNode[];
  skillLibraries: ResourceTreeNode[];
  materialGroups: readonly MaterialLibraryGroup[];
  skillGroups: readonly SkillLibraryGroup[];
}

const MATERIAL_KINDS: ReadonlyArray<{
  id: MaterialKind;
  label: string;
  description: string;
}> = [
  {
    id: "character",
    get label() {
      return t("catalogWorkspace.characterMaterialLibrary");
    },
    get description() {
      return t("bookLibraryKinds.charactersAndRelationships");
    }
  },
  {
    id: "gimmick",
    get label() {
      return t("catalogWorkspace.storyIdeaLibrary");
    },
    get description() {
      return t("bookLibraryKinds.coreIdeasAndHooks");
    }
  },
  {
    id: "plot",
    get label() {
      return t("catalogWorkspace.plotMaterialLibrary");
    },
    get description() {
      return t("bookLibraryKinds.plotOpeningAndRefinement");
    }
  },
  {
    id: "draft",
    get label() {
      return t("catalogWorkspace.proseMaterialLibrary");
    },
    get description() {
      return t("bookLibraryKinds.proseExcerptsAndWritingReferences");
    }
  },
  {
    id: "other",
    get label() {
      return t("catalogWorkspace.otherMaterialLibrary");
    },
    get description() {
      return t("bookLibraryKinds.materialsOutsideTheCategoriesAbove");
    }
  }
];
const SKILL_KINDS: ReadonlyArray<{
  id: SkillKind;
  label: string;
  description: string;
}> = [
  {
    id: "general",
    get label() {
      return t("catalogWorkspace.generalSkillLibrary");
    },
    get description() {
      return t("bookLibraryKinds.availableAcrossMultipleStages");
    }
  },
  {
    id: "plot",
    get label() {
      return t("catalogWorkspace.plotDesignSkillLibrary");
    },
    get description() {
      return t("bookLibraryKinds.characterPlotAndOutlineMethods");
    }
  },
  {
    id: "style",
    get label() {
      return t("catalogWorkspace.writingStyleSkillLibrary");
    },
    get description() {
      return t("bookLibraryKinds.manuscriptAndSectionWritingMethods");
    }
  },
  {
    id: "other",
    get label() {
      return t("catalogWorkspace.otherSkillLibrary");
    },
    get description() {
      return t("bookLibraryKinds.customWritingMethods");
    }
  }
];

export function useBookResourceBindings(props: BookResourceBindingProps) {
  const bindingMode = ref<"single" | "group">("single");
  const selectedGroupId = ref("");
  const selectedMaterialIds = reactive<Record<MaterialKind, string>>({
    character: "",
    gimmick: "",
    plot: "",
    draft: "",
    other: ""
  });
  const selectedSkillIds = reactive<Record<SkillKind, string>>({
    general: "",
    plot: "",
    style: "",
    other: ""
  });
  const bindingDomain = computed<"skill" | "material" | null>(() => {
    if (props.mode === "bind-skill") return "skill";
    if (props.mode === "bind-material") return "material";
    return null;
  });
  function materialCandidates(kind: MaterialKind): ResourceTreeNode[] {
    return props.materialLibraries.filter(
      (library) =>
        library.materialKind === kind || library.materialKind === "mixed"
    );
  }

  function materialKindDescription(
    kind: (typeof MATERIAL_KINDS)[number]
  ): string {
    return props.book?.workspaceType === "script" && kind.id === "plot"
      ? t("bookLibrarySelection.plotDesignAndRefinement")
      : kind.description;
  }

  function skillKindDescription(kind: (typeof SKILL_KINDS)[number]): string {
    return props.book?.workspaceType === "script" && kind.id === "style"
      ? t("bookLibrarySelection.manuscriptAndEpisodeWritingMethods")
      : kind.description;
  }

  function skillCandidates(kind: SkillKind): ResourceTreeNode[] {
    return props.skillLibraries.filter((library) => library.skillKind === kind);
  }

  function materialGroupLinks(
    group: MaterialLibraryGroup | undefined
  ): LinkedMaterialIdsByKind {
    const links: LinkedMaterialIdsByKind = {
      character: [],
      gimmick: [],
      plot: [],
      draft: [],
      other: []
    };
    if (!group) return links;
    for (const { id: kind } of MATERIAL_KINDS) {
      const libraryId = group.members[kind];
      if (
        libraryId &&
        materialCandidates(kind).some((library) => library.id === libraryId)
      ) {
        links[kind] = [libraryId];
      }
    }
    return links;
  }

  function skillGroupLinks(
    group: SkillLibraryGroup | undefined
  ): LinkedSkillIdsByKind {
    const links: LinkedSkillIdsByKind = {
      general: [],
      plot: [],
      style: [],
      other: []
    };
    if (!group) return links;
    for (const { id: kind } of SKILL_KINDS) {
      const libraryId = group.members[kind];
      if (
        libraryId &&
        skillCandidates(kind).some((library) => library.id === libraryId)
      ) {
        links[kind] = [libraryId];
      }
    }
    return links;
  }

  const availableMaterialGroups = computed(() =>
    props.materialGroups.filter((group) =>
      MATERIAL_KINDS.some(({ id }) => materialGroupLinks(group)[id].length > 0)
    )
  );
  const availableSkillGroups = computed(() =>
    props.skillGroups.filter((group) =>
      SKILL_KINDS.some(({ id }) => skillGroupLinks(group)[id].length > 0)
    )
  );
  const availableGroups = computed(() =>
    bindingDomain.value === "skill"
      ? availableSkillGroups.value
      : availableMaterialGroups.value
  );
  const selectedMaterialGroup = computed(() =>
    availableMaterialGroups.value.find(
      (group) => group.id === selectedGroupId.value
    )
  );
  const selectedSkillGroup = computed(() =>
    availableSkillGroups.value.find(
      (group) => group.id === selectedGroupId.value
    )
  );
  const groupOptions = computed(() => [
    {
      value: "",
      label:
        bindingDomain.value === "skill"
          ? t("bookLibrarySelection.notLinked")
          : t("bookLibrarySelection.noAssociation")
    },
    ...availableGroups.value.map((group) => ({
      value: group.id,
      label: group.title
    }))
  ]);

  function materialOptions(
    kind: MaterialKind
  ): Array<{ value: string; label: string }> {
    return [
      { value: "", label: t("bookLibrarySelection.noAssociation") },
      ...materialCandidates(kind).map((library) => ({
        value: library.id,
        label: library.badge
          ? `${library.label} · ${library.badge}`
          : library.label
      }))
    ];
  }

  function skillOptions(
    kind: SkillKind
  ): Array<{ value: string; label: string }> {
    return [
      { value: "", label: t("bookLibrarySelection.notLinked") },
      ...skillCandidates(kind).map((library) => ({
        value: library.id,
        label: library.badge
          ? `${library.label} · ${library.badge}`
          : library.label
      }))
    ];
  }

  function resetBindingDraft(): void {
    bindingMode.value = "single";
    selectedGroupId.value = "";
    for (const { id } of MATERIAL_KINDS) {
      selectedMaterialIds[id] =
        props.book?.boundMaterialLibraryIdsByKind?.[id]?.[0] ?? "";
    }
    for (const { id } of SKILL_KINDS) {
      selectedSkillIds[id] =
        props.book?.boundSkillLibraryIdsByKind?.[id]?.[0] ?? "";
    }
  }

  watch(availableGroups, (groups) => {
    if (
      selectedGroupId.value &&
      !groups.some((group) => group.id === selectedGroupId.value)
    ) {
      selectedGroupId.value = "";
    }
  });

  return {
    MATERIAL_KINDS,
    SKILL_KINDS,
    bindingMode,
    selectedGroupId,
    selectedMaterialIds,
    selectedSkillIds,
    bindingDomain,
    materialKindDescription,
    skillKindDescription,
    materialGroupLinks,
    skillGroupLinks,
    availableGroups,
    selectedMaterialGroup,
    selectedSkillGroup,
    groupOptions,
    materialOptions,
    skillOptions,
    resetBindingDraft
  };
}
