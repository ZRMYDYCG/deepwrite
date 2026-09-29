<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from "vue";
import type {
  CreateLibraryInput,
  CreateLibraryEntryInput,
  MaterialKind,
  MaterialLibraryKind,
  MaterialStageId,
  SkillKind
} from "@deepwrite/contracts";
import { uiMessage } from "../ui-feedback";
import AppIcon from "./AppIcon.vue";
import PopupSelect from "./PopupSelect.vue";

const t = createScopedTranslator("components.libraryProjectDialog");

type LibraryDomain = "material" | "skill";
type LibraryDialogOperation =
  | "create-library"
  | "create-entry"
  | "rename-library"
  | "rename-entry"
  | "remove-entry";
type CreateLibraryEntryDraft =
  | Omit<Extract<CreateLibraryEntryInput, { domain: "material" }>, "content">
  | Omit<Extract<CreateLibraryEntryInput, { domain: "skill" }>, "content">;

const props = defineProps<{
  open: boolean;
  operation: LibraryDialogOperation | null;
  domain: LibraryDomain;
  libraryId?: string | undefined;
  libraryTitle?: string | undefined;
  materialKind?: MaterialLibraryKind | undefined;
  entryId?: string | undefined;
  entryTitle?: string | undefined;
  workspaceType?: "short" | "script" | "long" | undefined;
  submitting?: boolean | undefined;
}>();

const emit = defineEmits<{
  close: [];
  createLibrary: [payload: CreateLibraryInput];
  createEntry: [payload: CreateLibraryEntryDraft];
  renameLibrary: [
    payload: { domain: LibraryDomain; libraryId: string; title: string }
  ];
  renameEntry: [
    payload: {
      domain: LibraryDomain;
      libraryId: string;
      entryId: string;
      title: string;
    }
  ];
  removeEntry: [
    payload: {
      domain: LibraryDomain;
      libraryId: string;
      entryId: string;
    }
  ];
}>();

const title = ref("");
const stageId = ref<MaterialStageId>("other");
const libraryKind = ref<MaterialKind | SkillKind>("character");
const titleInput = ref<HTMLInputElement | null>(null);
const domainLabel = computed(() =>
  props.domain === "material" ? t("material") : t("skill")
);
const heading = computed(() => {
  if (props.operation === "create-library")
    return t("newValueLibrary", {
      arg0: domainLabel.value
    });
  if (props.operation === "create-entry")
    return t("newEntryInValue", {
      arg0: props.libraryTitle ?? t("library")
    });
  if (props.operation === "rename-library")
    return t("renameValueLibrary", {
      arg0: domainLabel.value
    });
  if (props.operation === "rename-entry") return t("renameEntry");
  return t("deleteValue", {
    arg0: props.entryTitle ?? t("entry")
  });
});
const libraryKindOptions = computed(() =>
  props.domain === "material"
    ? [
        {
          value: "character",
          label: t("characterMaterialLibrary")
        },
        {
          value: "gimmick",
          label: t("ideaMaterialLibrary")
        },
        {
          value: "plot",
          label: t("plotMaterialLibrary")
        },
        {
          value: "draft",
          label: t("manuscriptMaterialLibrary")
        },
        {
          value: "other",
          label: t("otherMaterialLibrary")
        }
      ]
    : [
        {
          value: "general",
          label: t("generalSkillLibrary")
        },
        {
          value: "plot",
          label: t("plotDesignSkillLibrary")
        },
        {
          value: "style",
          label: t("writingStyleSkillLibrary")
        },
        {
          value: "other",
          label: t("otherSkillLibrary")
        }
      ]
);
const stageOptions = computed(() => {
  const allOptions = [
    { value: "gimmick", label: t("idea") },
    {
      value: "character",
      label: t("characterConcept")
    },
    { value: "pacing", label: t("plotDesign") },
    {
      value: "intro",
      label: t("introductionDesign")
    },
    {
      value: "plot_refine",
      label: t("plotDevelopment")
    },
    {
      value: "draft_excerpt",
      label: t("manuscriptExcerpts")
    },
    {
      value: "other",
      label: t("otherMaterials")
    }
  ];
  const allowedByKind: Record<MaterialLibraryKind, readonly string[]> = {
    character: ["character"],
    gimmick: ["gimmick"],
    plot: ["pacing", "intro", "plot_refine"],
    draft: ["draft_excerpt"],
    other: ["other"],
    mixed: allOptions.map(({ value }) => value)
  };
  const allowed = new Set(allowedByKind[props.materialKind ?? "mixed"]);
  return allOptions.filter(({ value }) => allowed.has(value));
});
const showEntryStageField = computed(
  () => props.operation === "create-entry" && props.domain === "material"
);

function requestClose(): void {
  if (!props.submitting) emit("close");
}

function submit(): void {
  if (props.operation === "remove-entry") {
    if (!props.libraryId || !props.entryId) {
      uiMessage.error(t("entryToDeleteNotFound"));
      return;
    }
    emit("removeEntry", {
      domain: props.domain,
      libraryId: props.libraryId,
      entryId: props.entryId
    });
    return;
  }

  const normalizedTitle = title.value.trim();
  if (!normalizedTitle) {
    uiMessage.warning(
      props.operation === "create-library"
        ? t("enterALibraryName")
        : t("enterAnEntryName")
    );
    titleInput.value?.focus();
    return;
  }
  if (props.operation === "create-library") {
    if (props.domain === "material") {
      emit("createLibrary", {
        domain: "material",
        name: normalizedTitle,
        materialKind: libraryKind.value as MaterialKind
      });
    } else {
      emit("createLibrary", {
        domain: "skill",
        name: normalizedTitle,
        skillKind: libraryKind.value as SkillKind
      });
    }
    return;
  }
  if (props.operation === "rename-library") {
    if (!props.libraryId) {
      uiMessage.error(t("libraryToRenameNotFound"));
      return;
    }
    emit("renameLibrary", {
      domain: props.domain,
      libraryId: props.libraryId,
      title: normalizedTitle
    });
    return;
  }
  if (props.operation === "rename-entry") {
    if (!props.libraryId || !props.entryId) {
      uiMessage.error(t("entryToRenameNotFound"));
      return;
    }
    emit("renameEntry", {
      domain: props.domain,
      libraryId: props.libraryId,
      entryId: props.entryId,
      title: normalizedTitle
    });
    return;
  }
  if (!props.libraryId) {
    uiMessage.error(t("targetLibraryNotFound"));
    return;
  }
  if (props.domain === "material") {
    emit("createEntry", {
      domain: "material",
      libraryId: props.libraryId,
      title: normalizedTitle,
      stageId: stageId.value
    });
  } else {
    emit("createEntry", {
      domain: "skill",
      libraryId: props.libraryId,
      title: normalizedTitle
    });
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === "Escape") requestClose();
}

watch(
  () =>
    [
      props.open,
      props.operation,
      props.domain,
      props.libraryId,
      props.materialKind,
      props.workspaceType
    ] as const,
  ([open]) => {
    if (!open) return;
    title.value =
      props.operation === "rename-library"
        ? (props.libraryTitle ?? "")
        : props.operation === "rename-entry"
          ? (props.entryTitle ?? "")
          : "";
    libraryKind.value = props.domain === "material" ? "character" : "general";
    stageId.value =
      (stageOptions.value[0]?.value as MaterialStageId | undefined) ?? "other";
    if (props.operation !== "remove-entry") {
      void nextTick(() => titleInput.value?.focus());
    }
  },
  { immediate: true }
);

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @mousedown.self="requestClose">
      <section
        class="workspace-dialog library-project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-project-dialog-title"
      >
        <header>
          <div>
            <span class="dialog-eyebrow">{{
              t("libraryLocalFolderProjectMessage", { arg0: domainLabel ?? "" })
            }}</span>
            <h2 id="library-project-dialog-title">{{ heading }}</h2>
          </div>
          <button
            class="dialog-close"
            type="button"
            :aria-label="t('close')"
            :disabled="submitting"
            @click="requestClose"
          >
            ×
          </button>
        </header>

        <form
          class="dialog-content catalog-resource-form"
          @submit.prevent="submit"
        >
          <template v-if="operation === 'create-library'">
            <p class="dialog-description">
              {{ t("newLibrariesAreSavedAutomaticallyInTheCurrentWorkspace") }}
            </p>
            <label class="book-resource-name-field">
              <span>{{
                t("libraryNameMessage", {
                  arg0: domainLabel ?? ""
                })
              }}</span>
              <input
                ref="titleInput"
                v-model="title"
                type="text"
                maxlength="80"
                autocomplete="off"
                :placeholder="
                  t('enterAValueLibraryName', {
                    arg0: domainLabel
                  })
                "
                :disabled="submitting"
              />
            </label>
            <p class="book-resource-help">
              {{ t("thisLibraryIsSharedAcrossShortStoriesScreenplaysAnd") }}
            </p>
            <label
              class="book-resource-name-field catalog-resource-stage-field"
            >
              <span>{{
                t("libraryCategoryMessage", {
                  arg0: domainLabel ?? ""
                })
              }}</span>
              <PopupSelect
                :model-value="libraryKind"
                :options="libraryKindOptions"
                :accessible-label="
                  t('valueLibraryCategory', {
                    arg0: domainLabel
                  })
                "
                size="large"
                :disabled="submitting"
                :menu-min-width="220"
                @update:model-value="
                  libraryKind = String($event) as MaterialKind | SkillKind
                "
              />
            </label>
            <p class="book-resource-help">
              {{ t("theFolderContainsDeepwriteJsonWithEntriesInEntries") }}
            </p>
          </template>

          <template
            v-else-if="
              operation === 'create-entry' ||
              operation === 'rename-library' ||
              operation === 'rename-entry'
            "
          >
            <p class="dialog-description">
              {{
                operation === "create-entry"
                  ? t("newEntriesAreImmediatelyCreatedAsMarkdownFilesIn")
                  : t("theNewNameIsSavedImmediatelyToTheLocal")
              }}
            </p>
            <label class="book-resource-name-field">
              <span>{{
                operation === "rename-library"
                  ? t("valueLibraryName", {
                      arg0: domainLabel
                    })
                  : t("entryName")
              }}</span>
              <input
                ref="titleInput"
                v-model="title"
                type="text"
                maxlength="80"
                autocomplete="off"
                :placeholder="
                  operation === 'rename-library'
                    ? t('enterAValueLibraryName', { arg0: domainLabel })
                    : t('enterAnEntryName')
                "
                :disabled="submitting"
              />
            </label>
            <label
              v-if="showEntryStageField"
              class="book-resource-name-field catalog-resource-stage-field"
            >
              <span>{{ t("contentStage") }}</span>
              <PopupSelect
                :model-value="stageId"
                :options="stageOptions"
                :accessible-label="t('contentStage')"
                size="large"
                :disabled="submitting"
                :menu-min-width="220"
                @update:model-value="
                  stageId = String($event) as MaterialStageId
                "
              />
            </label>
          </template>

          <div v-else class="catalog-resource-warning">
            <AppIcon name="trash" :size="20" />
            <div>
              <strong>{{
                t("thisDeletesTheCorrespondingMarkdownFile")
              }}</strong>
              <p>
                {{
                  t("willBeDeletedFromAndFromDiskMessage", {
                    arg0: entryTitle ?? "",
                    arg1: libraryTitle ?? ""
                  })
                }}
              </p>
            </div>
          </div>

          <div class="dialog-actions">
            <button
              class="dialog-secondary-button"
              type="button"
              :disabled="submitting"
              @click="requestClose"
            >
              {{ t("cancel") }}
            </button>
            <button
              class="dialog-primary-button"
              :class="{ 'is-danger': operation === 'remove-entry' }"
              type="submit"
              :disabled="submitting"
            >
              {{
                submitting
                  ? t("processing")
                  : operation === "create-library"
                    ? t("createValueLibrary", {
                        arg0: domainLabel
                      })
                    : operation === "create-entry"
                      ? t("createEntry")
                      : operation === "rename-library" ||
                          operation === "rename-entry"
                        ? t("saveName")
                        : t("delete")
              }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>
