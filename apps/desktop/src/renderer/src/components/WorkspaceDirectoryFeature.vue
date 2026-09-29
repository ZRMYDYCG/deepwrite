<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import AppIcon from "./AppIcon.vue";

const t = createScopedTranslator("components.workspaceDirectoryFeature");

withDefaults(
  defineProps<{
    path: string | null;
    loading: boolean;
    embedded?: boolean;
    runtimeAvailable?: boolean;
  }>(),
  { embedded: false, runtimeAvailable: true }
);

const emit = defineEmits<{
  choose: [];
}>();
</script>

<template>
  <section
    class="workspace-settings-panel"
    :class="{ 'is-embedded': embedded }"
  >
    <header v-if="!embedded">
      <div>
        <span class="dialog-eyebrow">DeepWrite</span>
        <h2>{{ t("workspaceFolder") }}</h2>
      </div>
    </header>

    <div class="dialog-content">
      <p class="dialog-description">
        {{ t("setTheDefaultLocationForFutureProjectCreationAnd") }}
      </p>
      <div class="directory-card">
        <AppIcon name="directory" :size="20" />
        <div>
          <strong>{{
            path ? t("currentWorkspaceFolder") : t("noWorkspaceFolderSelected")
          }}</strong>
          <code>{{
            path ?? t("youWillAlsoBePromptedWhenFirstCreatingOr")
          }}</code>
        </div>
        <span>{{ path ? t("enabled") : t("notSet") }}</span>
      </div>
      <div class="dialog-note">
        {{ t("newBooksAndLegacyImportsGoInBooksMaterials") }}
      </div>
      <div class="dialog-actions">
        <button
          class="dialog-primary-button"
          type="button"
          :disabled="loading || !runtimeAvailable"
          @click="emit('choose')"
        >
          {{
            loading
              ? t("selecting")
              : path
                ? t("changeWorkspaceFolder")
                : t("chooseWorkspaceFolder")
          }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.workspace-settings-panel.is-embedded {
  width: 100%;
  max-width: 760px;
  min-height: 0;
  border-color: var(--theme-line-soft);
  border-radius: 13px;
  box-shadow: none;
}

.is-embedded .dialog-content {
  min-width: 0;
  padding: 18px;
}

.is-embedded .directory-card code {
  overflow-wrap: anywhere;
  white-space: normal;
}

@media (max-width: 600px) {
  .is-embedded .directory-card {
    grid-template-columns: 24px minmax(0, 1fr);
  }

  .is-embedded .directory-card > span {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
