<script setup lang="ts">
import { nextTick, ref, useId, watch } from "vue";
import AppIcon from "../../components/AppIcon.vue";
import { createScopedTranslator } from "../../i18n";
import { formatError } from "../../i18n/errors";
import { uiMessage } from "../../ui-feedback";

const t = createScopedTranslator("extras.analysisUi");
const props = defineProps<{
  busy: boolean;
  status: string;
  disabled?: boolean;
  stop: () => Promise<unknown>;
  clear: () => void;
}>();
const titleId = useId();
const descriptionId = useId();
const trigger = ref<HTMLButtonElement | null>(null);
const dialog = ref<HTMLElement | null>(null);
const cancel = ref<HTMLButtonElement | null>(null);
const confirming = ref(false);
const pending = ref(false);

async function close(): Promise<void> {
  if (pending.value) return;
  confirming.value = false;
  await nextTick();
  trigger.value?.focus();
}

function waitForStop(): Promise<boolean> {
  if (!props.busy) return Promise.resolve(true);
  return new Promise((resolve) => {
    const unwatch = watch(
      () => [props.busy, props.status] as const,
      ([busy, status]) => {
        if (!busy) finish(true);
        else if (status !== "stopping") finish(false);
      },
      { flush: "sync" }
    );
    const timeout = window.setTimeout(() => finish(false), 30000);
    function finish(stopped: boolean): void {
      window.clearTimeout(timeout);
      unwatch();
      resolve(stopped);
    }
  });
}

async function refresh(): Promise<void> {
  if (pending.value || props.disabled) return;
  pending.value = true;
  try {
    if (props.busy) {
      await props.stop();
      if (props.busy && props.status !== "stopping") {
        uiMessage.error(t("stopBeforeClearFailed"));
        return;
      }
      if (!(await waitForStop())) {
        uiMessage.error(t("stopBeforeClearFailed"));
        return;
      }
    }
    props.clear();
    confirming.value = false;
    await nextTick();
    trigger.value?.focus();
  } catch (error) {
    uiMessage.error(formatError(error, t("clearWorkbenchFailed")));
  } finally {
    pending.value = false;
  }
}

async function requestRefresh(): Promise<void> {
  if (props.busy) {
    confirming.value = true;
    await nextTick();
    cancel.value?.focus();
  } else {
    await refresh();
  }
}

function onDialogKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    void close();
  }
  if (event.key !== "Tab" || !dialog.value) return;
  const buttons = [
    ...dialog.value.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")
  ];
  const first = buttons[0];
  const last = buttons.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
</script>

<template>
  <button
    ref="trigger"
    type="button"
    class="analysis-refresh-button"
    :title="t('clearWorkbench')"
    :aria-label="t('clearWorkbench')"
    :disabled="pending || disabled"
    @click="requestRefresh"
  >
    <AppIcon name="refresh" :size="16" />
  </button>
  <Teleport to="body">
    <div
      v-if="confirming"
      class="analysis-refresh-backdrop"
      @mousedown.self="close"
    >
      <section
        ref="dialog"
        class="analysis-refresh-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="descriptionId"
        @keydown="onDialogKeydown"
      >
        <h2 :id="titleId">{{ t("clearRunningTitle") }}</h2>
        <p :id="descriptionId">{{ t("clearRunningDescription") }}</p>
        <div class="analysis-refresh-dialog-actions">
          <button ref="cancel" type="button" :disabled="pending" @click="close">
            {{ t("cancelClear") }}
          </button>
          <button
            type="button"
            class="analysis-refresh-confirm"
            :disabled="pending"
            @click="refresh"
          >
            {{ pending ? t("clearingWorkbench") : t("confirmClear") }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
