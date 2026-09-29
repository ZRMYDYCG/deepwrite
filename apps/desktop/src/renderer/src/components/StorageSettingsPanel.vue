<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { useStorageSettings } from "../composables/useStorageSettings";
import { uiMessage } from "../ui-feedback";

const t = createScopedTranslator("components.storageSettingsPanel");

const props = defineProps<{
  workspaceDirectoryPath: string | null;
  workspaceDirectoryLoading: boolean;
  runtimeAvailable: boolean;
}>();
const emit = defineEmits<{
  chooseWorkspaceDirectory: [];
  resetWorkspaceDirectory: [];
}>();
const storage = useStorageSettings({
  api: () => window.deepwrite?.storageSettings,
  notifications: uiMessage
});
const { settings, loading, migrating, restarting, load } = storage;
const disabled = computed(
  () =>
    !props.runtimeAvailable ||
    !settings.value ||
    loading.value ||
    migrating.value ||
    restarting.value ||
    props.workspaceDirectoryLoading
);
const directories = computed(() => {
  const workspace = settings.value?.workspace;
  const workspacePath = props.workspaceDirectoryPath ?? workspace?.path;
  return [
    {
      kind: "user-data" as const,
      title: t("userDataFolder"),
      description: t("storesHistoryModelsAndKeysAgentSettingsGeneralAnd"),
      note: t("changingTheLocationMigratesExistingDataAndRestartsThe"),
      path: settings.value?.userData.path,
      isDefault: settings.value?.userData.isDefault
    },
    {
      kind: "workspace" as const,
      title: t("workspaceFolder"),
      description: t("setsTheDefaultLocationForNewAndImportedWorks"),
      note: t("sharedWithWorkspaceFolderSettingsChangingThisLocationDoes"),
      path: workspacePath,
      isDefault: workspace
        ? workspacePath === workspace.path
          ? workspace.isDefault
          : workspacePath === workspace.defaultPath
        : undefined
    }
  ];
});

function changeDirectory(kind: "user-data" | "workspace", reset = false): void {
  if (disabled.value) return;
  if (kind === "user-data") {
    void storage.changeUserData(reset);
  } else if (reset) {
    emit("resetWorkspaceDirectory");
  } else {
    emit("chooseWorkspaceDirectory");
  }
}

watch(
  () => props.workspaceDirectoryPath,
  () => void load()
);
onMounted(load);
onBeforeUnmount(storage.dispose);
</script>

<template>
  <section
    class="settings-group"
    aria-labelledby="storage-settings-title"
    :aria-busy="loading || migrating || restarting"
  >
    <div class="storage-heading">
      <h2 id="storage-settings-title" class="settings-group-title">
        {{ t("storageSettings") }}
      </h2>
      <button
        class="storage-refresh"
        type="button"
        :disabled="loading || migrating || restarting || !runtimeAvailable"
        @click="load"
      >
        {{ loading ? t("reading") : t("refreshLocations") }}
      </button>
    </div>
    <article
      v-for="directory in directories"
      :key="directory.kind"
      class="settings-card storage-card"
      :aria-label="directory.title"
    >
      <div class="storage-description">
        <h3>{{ directory.title }}</h3>
        <p>{{ directory.description }}</p>
      </div>
      <dl class="storage-paths">
        <div>
          <dt>{{ t("currentLocation") }}</dt>
          <dd>{{ directory.path ?? "—" }}</dd>
        </div>
      </dl>
      <p class="storage-note">{{ directory.note }}</p>
      <div class="storage-actions">
        <button
          class="storage-button is-primary"
          type="button"
          :disabled="disabled"
          :aria-label="
            t('changeValue', {
              arg0: directory.title
            })
          "
          @click="changeDirectory(directory.kind)"
        >
          {{
            directory.kind === "user-data" && restarting
              ? t("restarting")
              : directory.kind === "user-data" && migrating
                ? t("processing")
                : t("changeLocation")
          }}
        </button>
        <button
          class="storage-button"
          type="button"
          :disabled="disabled"
          :aria-label="
            t('openValue', {
              arg0: directory.title
            })
          "
          @click="storage.openDirectory(directory.kind)"
        >
          {{ t("openFolder") }}
        </button>
        <button
          class="storage-button"
          type="button"
          :disabled="disabled || directory.isDefault"
          :aria-label="
            t('restoreDefaultValueLocation', {
              arg0: directory.title
            })
          "
          @click="changeDirectory(directory.kind, true)"
        >
          {{ t("restoreDefaultLocation") }}
        </button>
      </div>
    </article>
  </section>
</template>

<style scoped src="./settings-page.css"></style>
<style scoped src="./storage-settings.css"></style>
