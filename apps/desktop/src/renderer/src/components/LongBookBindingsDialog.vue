<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch
} from "vue";
import type {
  LinkedMaterialIdsByKind,
  LinkedSkillIdsByKind,
  LongLinkedResourceStageScopes,
  MaterialKind,
  MaterialLibrary,
  SkillKind,
  SkillLibrary
} from "@deepwrite/contracts";
import AppIcon from "./AppIcon.vue";
import PopupSelect from "./PopupSelect.vue";
import {
  LONG_MATERIAL_BINDING_KINDS,
  LONG_SKILL_BINDING_KINDS
} from "./longBookBindingOptions";

const t = createScopedTranslator("components.longBookBindingsDialog");

type LongBindingDomain = "skill" | "material";

const props = withDefaults(
  defineProps<{
    mode: LongBindingDomain | null;
    bookTitle: string;
    materials?: readonly MaterialLibrary[];
    skills?: readonly SkillLibrary[];
    linkedMaterialIdsByKind: LinkedMaterialIdsByKind;
    linkedSkillIdsByKind: LinkedSkillIdsByKind;
    linkedResourceStageScopes: LongLinkedResourceStageScopes;
    submitting?: boolean;
  }>(),
  {
    materials: () => [],
    skills: () => [],
    submitting: false
  }
);

const emit = defineEmits<{
  close: [];
  submit: [
    payload: {
      linkedMaterialIdsByKind: LinkedMaterialIdsByKind;
      linkedSkillIdsByKind: LinkedSkillIdsByKind;
      linkedResourceStageScopes: LongLinkedResourceStageScopes;
    }
  ];
}>();

const materialKinds = LONG_MATERIAL_BINDING_KINDS;
const skillKinds = LONG_SKILL_BINDING_KINDS;

const selectedMaterials = reactive<Record<MaterialKind, string[]>>({
  character: [],
  gimmick: [],
  plot: [],
  draft: [],
  other: []
});
const selectedSkills = reactive<Record<SkillKind, string[]>>({
  general: [],
  plot: [],
  style: [],
  other: []
});
const materialCandidates = reactive<Record<MaterialKind, string>>({
  character: "",
  gimmick: "",
  plot: "",
  draft: "",
  other: ""
});
const skillCandidates = reactive<Record<SkillKind, string>>({
  general: "",
  plot: "",
  style: "",
  other: ""
});
const dialog = ref<HTMLElement | null>(null);

const title = computed(() =>
  props.mode === "skill" ? t("skillLibraryLinks") : t("materialLibraryLinks")
);
const heading = computed(() =>
  props.mode === "skill" ? t("linkSkillLibraries") : t("linkMaterialLibraries")
);
const description = computed(() =>
  props.mode === "skill"
    ? t("linkedSkillsCanBeLoadedAtAnyStageLink")
    : t("linkedMaterialsCanBeLoadedAtAnyStageLink")
);

function materialOptions(kind: MaterialKind): Array<{
  value: string;
  label: string;
}> {
  const selected = new Set(selectedMaterials[kind]);
  return [
    {
      value: "",
      label: t("addAMaterialLibrary")
    },
    ...props.materials
      .filter(
        (library) =>
          (library.materialKind === kind || library.materialKind === "mixed") &&
          !selected.has(library.id)
      )
      .map((library) => ({
        value: library.id,
        label: library.title
      }))
  ];
}

function skillOptions(kind: SkillKind): Array<{
  value: string;
  label: string;
}> {
  const selected = new Set(selectedSkills[kind]);
  return [
    {
      value: "",
      label: t("addASkillLibrary")
    },
    ...props.skills
      .filter(
        (library) => library.skillKind === kind && !selected.has(library.id)
      )
      .map((library) => ({
        value: library.id,
        label: library.isBuiltin
          ? t("valueOfficial", {
              arg0: library.title
            })
          : library.title
      }))
  ];
}

function reset(): void {
  for (const { id } of materialKinds) {
    selectedMaterials[id] = [...props.linkedMaterialIdsByKind[id]];
    materialCandidates[id] = "";
  }
  for (const { id } of skillKinds) {
    selectedSkills[id] = [...props.linkedSkillIdsByKind[id]];
    skillCandidates[id] = "";
  }
}

function selectedMaterialLinks(): LinkedMaterialIdsByKind {
  return Object.fromEntries(
    materialKinds.map(({ id }) => [id, [...selectedMaterials[id]]])
  ) as LinkedMaterialIdsByKind;
}

function selectedSkillLinks(): LinkedSkillIdsByKind {
  return Object.fromEntries(
    skillKinds.map(({ id }) => [id, [...selectedSkills[id]]])
  ) as LinkedSkillIdsByKind;
}

function addMaterial(kind: MaterialKind, value: unknown): void {
  const id = String(value ?? "").trim();
  materialCandidates[kind] = "";
  if (!id || selectedMaterials[kind].includes(id)) return;
  selectedMaterials[kind] = [...selectedMaterials[kind], id];
}

function addSkill(kind: SkillKind, value: unknown): void {
  const id = String(value ?? "").trim();
  skillCandidates[kind] = "";
  if (!id || selectedSkills[kind].includes(id)) return;
  selectedSkills[kind] = [...selectedSkills[kind], id];
}

function materialLabel(id: string): string {
  return (
    props.materials.find((candidate) => candidate.id === id)?.title ??
    t("valueMissingFromCatalog", { arg0: id })
  );
}

function skillLabel(id: string): string {
  const library = props.skills.find((candidate) => candidate.id === id);
  if (!library)
    return t("valueMissingFromCatalog", {
      arg0: id
    });
  return library.isBuiltin
    ? t("valueOfficial", {
        arg0: library.title
      })
    : library.title;
}

function requestClose(): void {
  if (!props.submitting) emit("close");
}

function submit(): void {
  emit("submit", {
    linkedMaterialIdsByKind: selectedMaterialLinks(),
    linkedSkillIdsByKind: selectedSkillLinks(),
    linkedResourceStageScopes: { materials: {}, skills: {} }
  });
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.mode && event.key === "Escape") requestClose();
}

watch(
  () => props.mode,
  (mode) => {
    if (!mode) return;
    reset();
    void nextTick(() => dialog.value?.focus());
  },
  { immediate: true }
);
onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="mode" class="dialog-backdrop" @mousedown.self="requestClose">
      <section
        ref="dialog"
        class="workspace-dialog book-binding-dialog long-binding-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`long-binding-title-${mode}`"
        tabindex="-1"
      >
        <header>
          <div>
            <span class="dialog-eyebrow">{{ bookTitle }}</span>
            <h2 :id="`long-binding-title-${mode}`">{{ title }}</h2>
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
          class="dialog-content create-short-book-form"
          @submit.prevent="submit"
        >
          <section
            class="create-short-binding-panel"
            :aria-labelledby="`long-binding-heading-${mode}`"
          >
            <div class="create-short-binding-heading">
              <span class="create-short-binding-icon">
                <AppIcon
                  :name="mode === 'skill' ? 'library' : 'archive'"
                  :size="17"
                />
              </span>
              <div>
                <h3 :id="`long-binding-heading-${mode}`">{{ heading }}</h3>
                <p>{{ description }}</p>
              </div>
            </div>

            <div v-if="mode === 'material'" class="create-short-kind-grid">
              <div
                v-for="kind in materialKinds"
                :key="kind.id"
                class="create-short-kind-field long-binding-kind-field"
              >
                <span>
                  <strong>{{ kind.label }}</strong>
                  <small>{{ kind.description }}</small>
                </span>
                <div
                  v-if="selectedMaterials[kind.id].length"
                  class="long-binding-chips"
                >
                  <span
                    v-for="id in selectedMaterials[kind.id]"
                    :key="id"
                    class="long-binding-chip"
                  >
                    {{ materialLabel(id) }}
                    <button
                      type="button"
                      :aria-label="
                        t('unlinkValueValue', {
                          arg0: kind.label,
                          arg1: materialLabel(id)
                        })
                      "
                      :disabled="submitting"
                      @click="
                        selectedMaterials[kind.id] = selectedMaterials[
                          kind.id
                        ].filter((candidate) => candidate !== id)
                      "
                    >
                      ×
                    </button>
                  </span>
                </div>
                <small v-else class="long-binding-empty">{{
                  t("noLinks")
                }}</small>
                <PopupSelect
                  :model-value="materialCandidates[kind.id]"
                  :options="materialOptions(kind.id)"
                  :accessible-label="
                    t('addValue', {
                      arg0: kind.label
                    })
                  "
                  size="large"
                  :disabled="submitting || materialOptions(kind.id).length <= 1"
                  :menu-min-width="260"
                  :menu-z-index="230"
                  @update:model-value="addMaterial(kind.id, $event)"
                />
              </div>
            </div>

            <div v-else class="create-short-kind-grid">
              <div
                v-for="kind in skillKinds"
                :key="kind.id"
                class="create-short-kind-field long-binding-kind-field"
              >
                <span>
                  <strong>{{ kind.label }}</strong>
                  <small>{{ kind.description }}</small>
                </span>
                <div
                  v-if="selectedSkills[kind.id].length"
                  class="long-binding-chips"
                >
                  <span
                    v-for="id in selectedSkills[kind.id]"
                    :key="id"
                    class="long-binding-chip"
                  >
                    {{ skillLabel(id) }}
                    <button
                      type="button"
                      :aria-label="
                        t('unlinkValueValue', {
                          arg0: kind.label,
                          arg1: skillLabel(id)
                        })
                      "
                      :disabled="submitting"
                      @click="
                        selectedSkills[kind.id] = selectedSkills[
                          kind.id
                        ].filter((candidate) => candidate !== id)
                      "
                    >
                      ×
                    </button>
                  </span>
                </div>
                <small v-else class="long-binding-empty">{{
                  t("notLinked")
                }}</small>
                <PopupSelect
                  :model-value="skillCandidates[kind.id]"
                  :options="skillOptions(kind.id)"
                  :accessible-label="
                    t('addValue', {
                      arg0: kind.label
                    })
                  "
                  size="large"
                  :disabled="submitting || skillOptions(kind.id).length <= 1"
                  :menu-min-width="260"
                  :menu-z-index="230"
                  @update:model-value="addSkill(kind.id, $event)"
                />
              </div>
            </div>
            <p class="create-short-stable-hint">
              {{
                t("existingLinksToLibrariesTemporarilyMissingFromTheCatalog")
              }}
            </p>
          </section>

          <div class="dialog-actions create-short-book-actions">
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
              type="submit"
              :disabled="submitting"
            >
              {{ submitting ? t("saving") : t("saveLinks") }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped src="./long-book-bindings-dialog.css"></style>
