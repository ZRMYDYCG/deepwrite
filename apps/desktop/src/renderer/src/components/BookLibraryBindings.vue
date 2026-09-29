<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { watch } from "vue";
import type {
  LinkedMaterialIdsByKind,
  LinkedSkillIdsByKind
} from "@deepwrite/contracts";
import AppIcon from "./AppIcon.vue";
import PopupSelect from "./PopupSelect.vue";
import {
  useBookLibrarySelection,
  type BookLibrarySelectionProps
} from "../composables/useBookLibrarySelection";

const t = createScopedTranslator("components.bookLibraryBindings");
const props = defineProps<
  BookLibrarySelectionProps & { loading?: boolean; submitting?: boolean }
>();
const emit = defineEmits<{
  change: [
    value: {
      linkedMaterialIdsByKind: LinkedMaterialIdsByKind;
      linkedSkillIdsByKind: LinkedSkillIdsByKind;
    }
  ];
}>();
const {
  MATERIAL_KINDS,
  SKILL_KINDS,
  materialBindingMode,
  skillBindingMode,
  selectedMaterialGroupId,
  selectedSkillGroupId,
  selectedMaterialIds,
  selectedSkillIds,
  availableMaterialGroups,
  availableSkillGroups,
  selectedMaterialGroup,
  selectedSkillGroup,
  materialById,
  skillById,
  materialKindDescription,
  skillKindDescription,
  materialSelectOptions,
  skillSelectOptions,
  materialGroupOptions,
  skillGroupOptions,
  selectedMaterialLinks,
  selectedSkillLinks
} = useBookLibrarySelection(props);
watch(
  () => [selectedMaterialLinks(), selectedSkillLinks()] as const,
  ([linkedMaterialIdsByKind, linkedSkillIdsByKind]) =>
    emit("change", { linkedMaterialIdsByKind, linkedSkillIdsByKind }),
  { immediate: true, deep: true }
);
</script>
<template>
  <section
    class="create-short-binding-panel"
    aria-labelledby="create-short-skill-heading"
  >
    <div class="create-short-binding-heading">
      <span class="create-short-binding-icon"
        ><AppIcon name="library" :size="17"
      /></span>
      <div>
        <h3 id="create-short-skill-heading">
          {{ t("linkSkillLibraries") }}
        </h3>
        <p>
          {{ t("linkedSkillsCanBeLoadedAsNeededAtAny") }}
        </p>
      </div>
    </div>

    <div
      class="create-short-binding-modes"
      role="radiogroup"
      :aria-label="t('skillLibraryLinking')"
    >
      <label :class="{ 'is-selected': skillBindingMode === 'single' }">
        <input
          v-model="skillBindingMode"
          type="radio"
          value="single"
          :disabled="submitting"
        />
        {{ t("chooseByCategory") }}
      </label>
      <label
        :class="{ 'is-selected': skillBindingMode === 'group' }"
        :title="availableSkillGroups.length ? '' : t('noSkillGroupsAvailable')"
      >
        <input
          v-model="skillBindingMode"
          type="radio"
          value="group"
          :disabled="submitting || availableSkillGroups.length === 0"
        />
        {{ t("selectGroup") }}
      </label>
    </div>

    <div v-if="skillBindingMode === 'single'" class="create-short-kind-grid">
      <label
        v-for="kind in SKILL_KINDS"
        :key="kind.id"
        class="create-short-kind-field"
      >
        <span>
          <strong>{{ kind.label }}</strong>
          <small>{{ skillKindDescription(kind) }}</small>
        </span>
        <PopupSelect
          :model-value="selectedSkillIds[kind.id]"
          :options="skillSelectOptions(kind.id)"
          :accessible-label="kind.label"
          size="large"
          :disabled="loading || submitting"
          :menu-min-width="260"
          @update:model-value="selectedSkillIds[kind.id] = String($event)"
        />
      </label>
    </div>
    <div v-else class="create-short-group-picker">
      <label class="create-short-book-field">
        <span>{{ t("skillGroup") }}</span>
        <PopupSelect
          :model-value="selectedSkillGroupId"
          :options="skillGroupOptions"
          :accessible-label="t('skillGroup')"
          size="large"
          :disabled="loading || submitting"
          :menu-min-width="260"
          @update:model-value="selectedSkillGroupId = String($event)"
        />
      </label>
      <div v-if="selectedSkillGroup" class="create-short-group-members">
        <span v-for="kind in SKILL_KINDS" :key="kind.id">
          <small>{{ kind.label }}</small>
          <strong>
            {{
              skillById.get(selectedSkillGroup.members[kind.id] ?? "")?.title ??
              t("notConfigured")
            }}
          </strong>
        </span>
      </div>
      <p v-else class="create-short-stable-hint">
        {{ t("selectingAGroupLinksAllConfiguredSkillLibrariesIn") }}
      </p>
    </div>
  </section>

  <section
    class="create-short-binding-panel"
    aria-labelledby="create-short-material-heading"
  >
    <div class="create-short-binding-heading">
      <span class="create-short-binding-icon"
        ><AppIcon name="archive" :size="17"
      /></span>
      <div>
        <h3 id="create-short-material-heading">
          {{ t("linkMaterialLibraries") }}
        </h3>
        <p>
          {{ t("chooseMaterialLibrariesByPurposeYouCanAddMissing") }}
        </p>
      </div>
    </div>

    <div
      class="create-short-binding-modes"
      role="radiogroup"
      :aria-label="t('materialLibraryLinking')"
    >
      <label :class="{ 'is-selected': materialBindingMode === 'single' }">
        <input
          v-model="materialBindingMode"
          type="radio"
          value="single"
          :disabled="submitting"
        />
        {{ t("chooseByCategory") }}
      </label>
      <label
        :class="{ 'is-selected': materialBindingMode === 'group' }"
        :title="
          availableMaterialGroups.length ? '' : t('noMaterialGroupsAvailable')
        "
      >
        <input
          v-model="materialBindingMode"
          type="radio"
          value="group"
          :disabled="submitting || availableMaterialGroups.length === 0"
        />
        {{ t("selectGroup") }}
      </label>
    </div>

    <div v-if="materialBindingMode === 'single'" class="create-short-kind-grid">
      <label
        v-for="kind in MATERIAL_KINDS"
        :key="kind.id"
        class="create-short-kind-field"
      >
        <span>
          <strong>{{ kind.label }}</strong>
          <small>{{ materialKindDescription(kind) }}</small>
        </span>
        <PopupSelect
          :model-value="selectedMaterialIds[kind.id]"
          :options="materialSelectOptions(kind.id)"
          :accessible-label="kind.label"
          size="large"
          :disabled="loading || submitting"
          :menu-min-width="260"
          @update:model-value="selectedMaterialIds[kind.id] = String($event)"
        />
      </label>
    </div>
    <div v-else class="create-short-group-picker">
      <label class="create-short-book-field">
        <span>{{ t("materialGroup") }}</span>
        <PopupSelect
          :model-value="selectedMaterialGroupId"
          :options="materialGroupOptions"
          :accessible-label="t('materialGroup')"
          size="large"
          :disabled="loading || submitting"
          :menu-min-width="260"
          @update:model-value="selectedMaterialGroupId = String($event)"
        />
      </label>
      <div v-if="selectedMaterialGroup" class="create-short-group-members">
        <span v-for="kind in MATERIAL_KINDS" :key="kind.id">
          <small>{{ kind.label }}</small>
          <strong>
            {{
              materialById.get(selectedMaterialGroup.members[kind.id] ?? "")
                ?.title ?? t("notConfigured")
            }}
          </strong>
        </span>
      </div>
      <p v-else class="create-short-stable-hint">
        {{ t("selectingAGroupLinksAllConfiguredMaterialLibrariesIn") }}
      </p>
    </div>
  </section>
</template>
