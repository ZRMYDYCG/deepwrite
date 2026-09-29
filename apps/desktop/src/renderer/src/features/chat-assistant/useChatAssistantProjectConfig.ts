import { formatError } from "../../i18n/errors";
import { createScopedTranslator } from "../../i18n";
import { computed, ref } from "vue";
import {
  CHAT_ASSISTANT_PROJECT_PROMPT_MAX_LENGTH,
  chatAssistantProjectKey
} from "@deepwrite/contracts/renderer";
import type { ChatAssistantProjectRef } from "@deepwrite/contracts";
import type {
  PopupSelectOption,
  PopupSelectValue
} from "../../components/PopupSelect.vue";
import { uiMessage } from "../../ui-feedback";
import type { ChatAssistantModeFeature } from "./useChatAssistantMode";
import { groupedProjectOptions } from "./chatAssistantProjectOptions";
import {
  readChatProjectConfig,
  saveChatProjectConfig
} from "./chatAssistantProfiles";

const t = createScopedTranslator("extras.chatAssistant");
export function useChatAssistantProjectConfig(
  assistant: ChatAssistantModeFeature
) {
  const projectConfigOpen = ref(false);
  const projectConfigMode = ref<"add" | "edit">("add");
  const projectConfigProjectKey = ref("");
  const projectConfigPrompt = ref("");
  const projectConfigCustomized = ref(false);
  const projectConfigPending = ref(false);
  const configuredProjectKeys = computed(
    () =>
      new Set(
        assistant.configuredProjects.value.map(({ project }) =>
          chatAssistantProjectKey(project)
        )
      )
  );
  const availableProjectOptions = computed(() =>
    assistant.projectOptions.value.filter(
      (option) => !configuredProjectKeys.value.has(option.key)
    )
  );
  const projectBookOptions = computed<PopupSelectOption[]>(() => {
    if (projectConfigMode.value === "edit") {
      const selected = assistant.projectOptions.value.filter(
        (option) => option.key === projectConfigProjectKey.value
      );
      return groupedProjectOptions(selected);
    }
    return groupedProjectOptions(availableProjectOptions.value);
  });
  const projectConfigOption = computed(
    () =>
      assistant.projectOptions.value.find(
        ({ key }) => key === projectConfigProjectKey.value
      ) ?? null
  );
  const projectConfigTitle = computed(() =>
    projectConfigMode.value === "add" ? t("addProject") : t("editProject")
  );
  async function loadProjectConfigFor(
    project: ChatAssistantProjectRef
  ): Promise<void> {
    projectConfigPending.value = true;
    try {
      const config = await readChatProjectConfig(project);
      projectConfigPrompt.value = config.systemPrompt;
      projectConfigCustomized.value = config.customized;
    } catch (cause) {
      uiMessage.error(formatError(cause, t("readProjectConfigFailed")));
    } finally {
      projectConfigPending.value = false;
    }
  }

  function openAddProject(): void {
    if (!availableProjectOptions.value.length) {
      uiMessage.info(
        assistant.projectOptions.value.length
          ? t("allBooksLinked")
          : t("noLinkableBooks")
      );
      return;
    }
    projectConfigMode.value = "add";
    projectConfigProjectKey.value = "";
    projectConfigPrompt.value = "";
    projectConfigCustomized.value = false;
    projectConfigOpen.value = true;
  }

  async function openEditProject(value: PopupSelectValue): Promise<void> {
    const contextKey = String(value);
    const prefix = "context:project:";
    if (!contextKey.startsWith(prefix)) return;
    const projectKey = contextKey.slice(prefix.length);
    const option = assistant.configuredProjectOptions.value.find(
      (candidate) => candidate.key === projectKey
    );
    if (!option?.available) {
      uiMessage.info(t("noEditableProjects"));
      return;
    }
    projectConfigMode.value = "edit";
    projectConfigProjectKey.value = projectKey;
    projectConfigPrompt.value = "";
    projectConfigCustomized.value = false;
    projectConfigOpen.value = true;
    await loadProjectConfigFor(option.project);
  }

  function updateProjectAssociation(value: PopupSelectValue): void {
    if (projectConfigMode.value !== "add" || projectConfigPending.value) return;
    const key = String(value);
    const option = assistant.projectOptions.value.find(
      (candidate) => candidate.key === key
    );
    if (!option) return;
    projectConfigProjectKey.value = key;
    void loadProjectConfigFor(option.project);
  }

  async function saveProjectConfig(): Promise<void> {
    const option = projectConfigOption.value;
    if (!option) {
      uiMessage.warning(t("chooseLinkedBook"));
      return;
    }
    const prompt = projectConfigPrompt.value.trim();
    if (!prompt) {
      uiMessage.warning(t("projectPromptRequired"));
      return;
    }
    if (prompt.length > CHAT_ASSISTANT_PROJECT_PROMPT_MAX_LENGTH) {
      uiMessage.warning(
        t("projectPromptLimit", {
          limit: CHAT_ASSISTANT_PROJECT_PROMPT_MAX_LENGTH
        })
      );
      return;
    }
    projectConfigPending.value = true;
    try {
      const config = await saveChatProjectConfig(
        option.project,
        option.label,
        prompt
      );
      projectConfigPrompt.value = config.systemPrompt;
      projectConfigCustomized.value = config.customized;
      if (projectConfigMode.value === "add") {
        await assistant.refreshConfiguredProjects();
        assistant.selectProject(option.key);
        assistant.setMode("project");
      }
      projectConfigOpen.value = false;
      uiMessage.success(
        projectConfigMode.value === "add"
          ? t("projectAdded")
          : t("projectConfigurationSaved")
      );
    } catch (cause) {
      uiMessage.error(formatError(cause, t("saveProjectConfigFailed")));
    } finally {
      projectConfigPending.value = false;
    }
  }

  async function resetProjectConfig(): Promise<void> {
    const option = projectConfigOption.value;
    if (!option) {
      uiMessage.warning(t("linkedBookRequired"));
      return;
    }
    projectConfigPending.value = true;
    try {
      // Restores the default prompt; the project stays configured.
      const config = await saveChatProjectConfig(
        option.project,
        option.label,
        null
      );
      projectConfigPrompt.value = config.systemPrompt;
      projectConfigCustomized.value = config.customized;
      uiMessage.success(t("defaultProjectPromptRestored"));
    } catch (cause) {
      uiMessage.error(formatError(cause, t("restoreDefaultConfigFailed")));
    } finally {
      projectConfigPending.value = false;
    }
  }

  return {
    projectConfigOpen,
    projectConfigMode,
    projectConfigProjectKey,
    projectConfigPrompt,
    projectConfigCustomized,
    projectConfigPending,
    projectBookOptions,
    projectConfigOption,
    projectConfigTitle,
    updateProjectAssociation,
    saveProjectConfig,
    resetProjectConfig,
    openAddProject,
    openEditProject
  };
}
