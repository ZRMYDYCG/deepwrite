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
    projectConfigMode.value === "add" ? "添加项目" : "编辑项目"
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
      uiMessage.error(
        cause instanceof Error ? cause.message : "读取项目配置失败"
      );
    } finally {
      projectConfigPending.value = false;
    }
  }

  function openAddProject(): void {
    if (!availableProjectOptions.value.length) {
      uiMessage.info(
        assistant.projectOptions.value.length
          ? "当前书籍都已添加为聊天项目"
          : "当前没有可关联的短篇、剧本或长篇书籍"
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
      uiMessage.info("当前没有可编辑的关联项目");
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
      uiMessage.warning("请选择要关联的书籍");
      return;
    }
    const prompt = projectConfigPrompt.value.trim();
    if (!prompt) {
      uiMessage.warning("项目提示词不能为空");
      return;
    }
    if (prompt.length > CHAT_ASSISTANT_PROJECT_PROMPT_MAX_LENGTH) {
      uiMessage.warning(
        `项目提示词不能超过 ${CHAT_ASSISTANT_PROJECT_PROMPT_MAX_LENGTH} 个字符`
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
        projectConfigMode.value === "add" ? "项目已添加" : "项目配置已保存"
      );
    } catch (cause) {
      uiMessage.error(
        cause instanceof Error ? cause.message : "保存项目配置失败"
      );
    } finally {
      projectConfigPending.value = false;
    }
  }

  async function resetProjectConfig(): Promise<void> {
    const option = projectConfigOption.value;
    if (!option) {
      uiMessage.warning("请先选择关联书籍");
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
      uiMessage.success("已恢复默认项目提示词");
    } catch (cause) {
      uiMessage.error(
        cause instanceof Error ? cause.message : "恢复默认配置失败"
      );
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
