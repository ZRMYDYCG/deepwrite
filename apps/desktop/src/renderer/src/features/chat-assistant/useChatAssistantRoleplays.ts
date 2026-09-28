import { computed, ref } from "vue";
import type { ChatRoleplayProfile } from "@deepwrite/contracts";
import { uiMessage } from "../../ui-feedback";
import { listChatRoles, saveChatRole } from "./chatAssistantProfiles";
const SELECTION_KEY = "deepwrite:chat-assistant-roleplay:v1";
function readSelection(): string {
  try {
    return window.localStorage.getItem(SELECTION_KEY) ?? "";
  } catch {
    return "";
  }
}
export function useChatAssistantRoleplays() {
  const roleplays = ref<ChatRoleplayProfile[]>([]);
  const selectedRoleId = ref(readSelection());
  const selectedRole = computed(() =>
    roleplays.value.find((role) => role.id === selectedRoleId.value)
  );
  function select(id: string): boolean {
    if (!roleplays.value.some((role) => role.id === id)) return false;
    selectedRoleId.value = id;
    try {
      window.localStorage.setItem(SELECTION_KEY, id);
    } catch {
      /* Selection remains usable in memory. */
    }
    return true;
  }
  async function refresh(): Promise<void> {
    if (!window.deepwrite) return;
    try {
      roleplays.value = await listChatRoles();
    } catch {
      uiMessage.error("读取人物配置失败，请重新打开聊天后重试");
    }
  }
  async function save(
    config: Omit<ChatRoleplayProfile, "builtin">
  ): Promise<ChatRoleplayProfile> {
    const saved = await saveChatRole(config);
    roleplays.value = [
      ...roleplays.value.filter((role) => role.id !== saved.id),
      saved
    ];
    return saved;
  }
  void refresh();
  return { roleplays, selectedRoleId, selectedRole, select, save };
}
