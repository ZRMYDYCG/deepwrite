<script setup lang="ts">
import { nextTick, ref } from "vue";
import {
  CHAT_ASSISTANT_PROJECT_PROMPT_MAX_LENGTH,
  CHAT_ASSISTANT_ROLEPLAY_PROMPT_SUFFIX,
  ChatRoleplayProfileSchema,
  type ChatRoleplayProfile
} from "@deepwrite/contracts/renderer";
import { uiMessage } from "../../ui-feedback";
import type { ChatAssistantModeFeature } from "./useChatAssistantMode";
const props = defineProps<{ assistant: ChatAssistantModeFeature }>();
const opened = ref(false);
const pending = ref(false);
const editingId = ref("");
const name = ref("");
const prompt = ref("");
const nameInput = ref<HTMLInputElement | null>(null);
function open(config?: ChatRoleplayProfile): void {
  if (props.assistant.isBusy.value) return;
  editingId.value = config?.id ?? "";
  name.value = config?.name ?? "";
  prompt.value = config?.systemPrompt ?? "";
  opened.value = true;
  void nextTick(() => nameInput.value?.focus());
}
async function save(): Promise<void> {
  if (pending.value || props.assistant.isBusy.value) return;
  if (!name.value.trim()) {
    uiMessage.warning("请填写人物名称");
    return;
  }
  if (!prompt.value.trim()) {
    uiMessage.warning("请填写人物提示词");
    return;
  }
  const config = ChatRoleplayProfileSchema.omit({ builtin: true }).safeParse({
    id: editingId.value || crypto.randomUUID(),
    name: name.value,
    systemPrompt: prompt.value
  });
  if (!config.success) {
    uiMessage.warning("人物名称最多 120 个字符，提示词最多 60000 个字符");
    return;
  }
  pending.value = true;
  try {
    const saved = await props.assistant.saveRole(config.data);
    props.assistant.selectRole(saved.id);
    opened.value = false;
    uiMessage.success("人物配置已保存");
  } catch (error) {
    uiMessage.error(
      error instanceof Error ? error.message : "保存人物配置失败"
    );
  } finally {
    pending.value = false;
  }
}
defineExpose({ open, pending });
</script>
<template>
  <div
    v-if="opened"
    class="chat-assistant-config-backdrop"
    @mousedown.self="!pending && (opened = false)"
    @keydown.esc.stop.prevent="!pending && (opened = false)"
  >
    <section
      class="chat-assistant-config-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="人物扮演配置"
    >
      <header>
        <div>
          <strong>{{ editingId ? "编辑扮演配置" : "添加新扮演配置" }}</strong
          ><span>定义人物的身份、性格、说话方式和背景</span>
        </div>
        <button
          type="button"
          aria-label="关闭人物配置"
          :disabled="pending"
          @click="opened = false"
        >
          ×
        </button>
      </header>
      <label for="chat-roleplay-name">人物名称</label>
      <input
        id="chat-roleplay-name"
        ref="nameInput"
        v-model="name"
        :disabled="pending"
        maxlength="120"
        placeholder="为人物起一个名字"
      />
      <label for="chat-roleplay-prompt">人物提示词</label>
      <textarea
        id="chat-roleplay-prompt"
        v-model="prompt"
        :disabled="pending"
        :maxlength="CHAT_ASSISTANT_PROJECT_PROMPT_MAX_LENGTH"
        rows="10"
        placeholder="描述你希望扮演的人物……"
      />
      <div class="chat-assistant-config-meta">
        <span>仅使用人物定义和当前聊天记录，不使用工具或其他上下文。</span
        ><span
          >{{ prompt.length }} /
          {{ CHAT_ASSISTANT_PROJECT_PROMPT_MAX_LENGTH }}</span
        >
      </div>
      <p>提示词后会自动追加：{{ CHAT_ASSISTANT_ROLEPLAY_PROMPT_SUFFIX }}</p>
      <footer>
        <span /><button
          type="button"
          class="is-secondary"
          :disabled="pending"
          @click="opened = false"
        >
          取消</button
        ><button
          type="button"
          class="is-primary"
          :disabled="pending || assistant.isBusy.value"
          @click="save"
        >
          保存并开始聊天
        </button>
      </footer>
    </section>
  </div>
</template>
<style scoped src="./chat-assistant-config.css"></style>
