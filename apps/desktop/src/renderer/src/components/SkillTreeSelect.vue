<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { createScopedTranslator } from "../i18n";
import {
  SKILL_KIND_LABELS,
  SKILL_STAGE_LABELS
} from "../data/catalogWorkspace";
import {
  allSkillTreeKeys,
  buildSkillTree,
  defaultExpandedSkillTreeKeys,
  type SubagentAuthoringSkillOption
} from "../utils/subagentAuthoringSkillTree";
import AppIcon from "./AppIcon.vue";

const t = createScopedTranslator("components.skillTreeSelect");

const props = defineProps<{
  options: readonly SubagentAuthoringSkillOption[];
  selectedIds: readonly string[];
  max: number;
  disabled: boolean;
}>();

const emit = defineEmits<{ toggle: [skillId: string] }>();

const query = ref("");
const searching = computed(() => query.value.trim().length > 0);
const tree = computed(() =>
  buildSkillTree(props.options, query.value, (id) => SKILL_STAGE_LABELS[id])
);
const selected = computed(() => new Set(props.selectedIds));
const selectedOptions = computed(() =>
  props.options.filter((option) => selected.value.has(option.id))
);

// Browsing and searching keep separate open sets, so clearing the search
// returns to the layout the user left.
const browseOpen = ref<Set<string>>(new Set());
const searchOpen = ref<Set<string>>(new Set());
const openKeys = computed(() =>
  searching.value ? searchOpen.value : browseOpen.value
);

watch(
  () => props.options,
  () => {
    query.value = "";
    browseOpen.value = defaultExpandedSkillTreeKeys(tree.value);
  },
  { immediate: true }
);
watch(query, () => {
  if (searching.value) searchOpen.value = allSkillTreeKeys(tree.value);
});

function toggleOpen(key: string): void {
  const next = new Set(openKeys.value);
  if (!next.delete(key)) next.add(key);
  if (searching.value) searchOpen.value = next;
  else browseOpen.value = next;
}

function selectedCount(skills: readonly SubagentAuthoringSkillOption[]) {
  return skills.filter((skill) => selected.value.has(skill.id)).length;
}

function countLabel(
  skills: readonly SubagentAuthoringSkillOption[],
  total: number
): string {
  const chosen = selectedCount(skills);
  return chosen ? `${chosen}/${total}` : String(total);
}
</script>

<template>
  <div class="skill-tree">
    <div class="skill-tree-toolbar">
      <label class="skill-search">
        <AppIcon name="search" :size="14" />
        <input
          v-model="query"
          type="search"
          autocomplete="off"
          :placeholder="t('searchSkills')"
          :aria-label="t('searchSkills')"
        />
      </label>
      <span
        class="skill-selected-count"
        :class="{ 'is-full': selectedIds.length >= max }"
        aria-live="polite"
      >
        {{ t("selectedCount", { arg0: selectedIds.length, arg1: max }) }}
      </span>
    </div>

    <div class="skill-tree-scroll">
      <p v-if="!tree.length" class="skill-tree-empty">
        {{ t("noMatchingSkills") }}
      </p>
      <ul v-else class="skill-node-list">
        <li v-for="library in tree" :key="library.key">
          <button
            type="button"
            class="skill-node-row skill-node-library"
            :aria-expanded="openKeys.has(library.key)"
            @click="toggleOpen(library.key)"
          >
            <AppIcon
              class="skill-node-chevron"
              :class="{ 'is-open': openKeys.has(library.key) }"
              name="chevron"
              :size="13"
            />
            <AppIcon name="library" :size="15" />
            <span class="skill-node-title">{{ library.title }}</span>
            <span class="skill-node-tag">{{
              library.builtin ? t("builtin") : SKILL_KIND_LABELS[library.kind]
            }}</span>
            <span
              class="skill-node-count"
              :class="{
                'has-selection': library.stages.some((stage) =>
                  selectedCount(stage.skills)
                )
              }"
              >{{
                countLabel(
                  library.stages.flatMap((stage) => stage.skills),
                  library.count
                )
              }}</span
            >
          </button>

          <ul v-if="openKeys.has(library.key)" class="skill-node-list">
            <li v-for="stage in library.stages" :key="stage.key">
              <button
                type="button"
                class="skill-node-row skill-node-stage"
                :aria-expanded="openKeys.has(stage.key)"
                @click="toggleOpen(stage.key)"
              >
                <AppIcon
                  class="skill-node-chevron"
                  :class="{ 'is-open': openKeys.has(stage.key) }"
                  name="chevron"
                  :size="13"
                />
                <AppIcon name="folder" :size="14" />
                <span class="skill-node-title">{{
                  SKILL_STAGE_LABELS[stage.stageId]
                }}</span>
                <span
                  class="skill-node-count"
                  :class="{ 'has-selection': selectedCount(stage.skills) }"
                  >{{ countLabel(stage.skills, stage.skills.length) }}</span
                >
              </button>

              <ul v-if="openKeys.has(stage.key)" class="skill-node-list">
                <li v-for="skill in stage.skills" :key="skill.id">
                  <label
                    class="skill-node-row skill-node-skill"
                    :class="{ 'is-selected': selected.has(skill.id) }"
                  >
                    <input
                      type="checkbox"
                      :checked="selected.has(skill.id)"
                      :disabled="disabled"
                      @change="emit('toggle', skill.id)"
                    />
                    <span class="skill-node-title">{{ skill.title }}</span>
                  </label>
                </li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
    </div>

    <ul
      v-if="selectedOptions.length"
      class="skill-chips"
      :aria-label="t('selectedSkills')"
    >
      <li v-for="skill in selectedOptions" :key="skill.id">
        <span :title="`${skill.libraryTitle} · ${skill.title}`">{{
          skill.title
        }}</span>
        <button
          type="button"
          :disabled="disabled"
          :aria-label="t('removeValue', { arg0: skill.title })"
          @click="emit('toggle', skill.id)"
        >
          <AppIcon name="close" :size="11" />
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped src="./SkillTreeSelect.css"></style>
