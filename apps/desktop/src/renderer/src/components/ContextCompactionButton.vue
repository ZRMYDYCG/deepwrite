<script setup lang="ts">
import {
  computed,
  type CSSProperties,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch
} from "vue";
import { CONTEXT_COMPACTION_INSTRUCTIONS_MAX_LENGTH } from "@deepwrite/contracts/renderer";
import {
  cancelContextCompaction,
  pendingContextCompaction,
  requestContextCompaction
} from "../composables/agent-conversation/context-compaction";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{ sessionId: string; disabled?: boolean }>();

const trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLElement>();
const open = ref(false);
const instructions = ref("");
const panelId = `context-compaction-${useId()}`;
const position = ref<CSSProperties>({
  left: "0px",
  top: "0px",
  visibility: "hidden"
});
const pending = computed(() => pendingContextCompaction(props.sessionId));

async function place(): Promise<void> {
  await nextTick();
  const button = trigger.value;
  const element = panel.value;
  if (!button || !element) return;
  const rect = button.getBoundingClientRect();
  const margin = 8;
  const left = Math.min(
    Math.max(margin, rect.right - element.offsetWidth),
    Math.max(margin, window.innerWidth - element.offsetWidth - margin)
  );
  const above = rect.top - element.offsetHeight - margin;
  position.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(above >= margin ? above : Math.max(margin, Math.min(rect.bottom + margin, window.innerHeight - element.offsetHeight - margin)))}px`,
    visibility: "visible"
  };
}

function toggle(): void {
  if (props.disabled) return;
  open.value = !open.value;
  if (open.value) {
    instructions.value = pending.value?.instructions ?? "";
    position.value.visibility = "hidden";
    void place();
  }
}

function close(returnFocus = false): void {
  open.value = false;
  if (returnFocus) void nextTick(() => trigger.value?.focus());
}

function schedule(): void {
  requestContextCompaction(props.sessionId, instructions.value);
  close(true);
}

function cancel(): void {
  cancelContextCompaction(props.sessionId);
  close(true);
}

function handleOutside(event: Event): void {
  if (!open.value || !(event.target instanceof Node)) return;
  if (trigger.value?.contains(event.target)) return;
  if (panel.value?.contains(event.target)) return;
  close();
}

function handleViewportChange(): void {
  if (open.value) void place();
}

watch(
  () => props.sessionId,
  () => close()
);

onMounted(() => {
  document.addEventListener("pointerdown", handleOutside);
  window.addEventListener("resize", handleViewportChange);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleOutside);
  window.removeEventListener("resize", handleViewportChange);
});
</script>

<template>
  <span class="context-compaction-control" :class="{ 'is-pending': pending }">
    <button
      ref="trigger"
      class="context-compaction-trigger"
      type="button"
      :aria-label="pending ? '已安排压缩上下文，点击修改' : '压缩上下文'"
      :title="pending ? '下次发送前会先压缩上下文' : '压缩上下文'"
      :aria-expanded="open"
      :aria-controls="panelId"
      :disabled="disabled"
      @click="toggle"
    >
      <AppIcon name="archive" :size="14" />
      <span v-if="pending" class="context-compaction-pending">发送时压缩</span>
    </button>
    <Teleport to="body">
      <section
        v-if="open"
        :id="panelId"
        ref="panel"
        class="context-compaction-panel"
        role="dialog"
        aria-label="压缩上下文"
        :style="position"
        @keydown.esc.prevent="close(true)"
      >
        <strong>压缩上下文</strong>
        <p>
          把较早的对话整理成检查点，保留你的要求、已定的决定和进度；作品正文与设定不受影响。会在下次发送时、回复之前执行。
        </p>
        <label class="context-compaction-field">
          <span>需要重点保留的内容（可选）</span>
          <textarea
            v-model="instructions"
            rows="2"
            :maxlength="CONTEXT_COMPACTION_INSTRUCTIONS_MAX_LENGTH"
            placeholder="例如：第三章的伏笔安排、我对对白风格的要求"
          />
        </label>
        <div class="context-compaction-actions">
          <button
            v-if="pending"
            type="button"
            class="dialog-secondary-button"
            @click="cancel"
          >
            取消压缩
          </button>
          <button type="button" class="dialog-primary-button" @click="schedule">
            {{ pending ? "更新" : "发送时压缩" }}
          </button>
        </div>
      </section>
    </Teleport>
  </span>
</template>

<style scoped>
.context-compaction-control {
  display: inline-flex;
  align-items: center;
}

.context-compaction-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  min-width: 24px;
  padding: 0 5px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.context-compaction-trigger:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.context-compaction-trigger:disabled {
  opacity: 0.5;
  cursor: default;
}

.context-compaction-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.is-pending .context-compaction-trigger {
  background: var(--accent-soft);
  color: var(--accent);
}

.context-compaction-pending {
  white-space: nowrap;
}

.context-compaction-panel {
  position: fixed;
  z-index: 1600;
  display: grid;
  width: min(320px, calc(100vw - 16px));
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--theme-line);
  border-radius: 12px;
  background: var(--surface-raised);
  color: var(--text-primary);
  box-shadow: 0 8px 24px var(--shadow-color);
  font-size: 0.8125rem;
}

.context-compaction-panel p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.5;
}

.context-compaction-field {
  display: grid;
  gap: 4px;
  color: var(--text-secondary);
}

.context-compaction-field textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  padding: 6px 8px;
  border: 1px solid var(--theme-line);
  border-radius: 8px;
  background: var(--surface-main);
  color: var(--text-primary);
  font: inherit;
}

.context-compaction-field textarea:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 0;
}

.context-compaction-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
