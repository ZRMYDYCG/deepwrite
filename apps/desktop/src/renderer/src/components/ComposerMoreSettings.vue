<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { createId } from "@deepwrite/shared";
import AppIcon from "./AppIcon.vue";

const t = createScopedTranslator("components.composerMoreSettings");

const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const panelId = createId("composer-settings");
let observer: ResizeObserver | undefined;

function close(returnFocus = false): void {
  // Close teleported child menus before their triggers become hidden.
  root.value
    ?.querySelectorAll('.composer-settings-panel [aria-expanded="true"]')
    .forEach((control) => {
      control.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
  open.value = false;
  if (returnFocus) void nextTick(() => trigger.value?.focus());
}

function belongsToSettings(target: Node): boolean {
  if (root.value?.contains(target)) return true;
  // PopupSelect teleports its menu to body; keep the parent disclosure open.
  return [...(root.value?.querySelectorAll("[aria-controls]") ?? [])].some(
    (control) => {
      const id = control.getAttribute("aria-controls");
      return id && document.getElementById(id)?.contains(target);
    }
  );
}

function handleOutsideEvent(event: Event): void {
  if (event.target instanceof Node && !belongsToSettings(event.target)) close();
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && open.value) {
    event.preventDefault();
    event.stopPropagation();
    close(true);
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", handleOutsideEvent);
  document.addEventListener("focusin", handleOutsideEvent);
  const toolbar = root.value?.closest(".composer-toolbar");
  observer = new ResizeObserver(() => close());
  if (toolbar) observer.observe(toolbar);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleOutsideEvent);
  document.removeEventListener("focusin", handleOutsideEvent);
  observer?.disconnect();
});
</script>

<template>
  <div
    ref="root"
    class="composer-more-settings"
    :class="{ 'is-open': open }"
    @keydown="handleKeydown"
  >
    <button
      ref="trigger"
      class="composer-more-trigger"
      type="button"
      :aria-label="t('moreChatSettings')"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <AppIcon name="more" :size="16" />
      <span>{{ t("more") }}</span>
    </button>
    <div
      :id="panelId"
      class="composer-settings-panel"
      :aria-label="t('chatSettings')"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.composer-more-settings,
.composer-settings-panel {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.composer-more-trigger {
  display: none;
  align-items: center;
  gap: 4px;
  min-height: 30px;
  padding: 0 7px;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.75rem;
  white-space: nowrap;
  cursor: pointer;
}

.composer-more-trigger:hover,
.is-open > .composer-more-trigger {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.composer-more-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Keep the font-scaled breakpoint below the composer's 760px content cap. */
@container composer (max-width: min(32rem, 560px)) {
  .composer-more-trigger {
    display: flex;
  }

  .composer-settings-panel {
    position: absolute;
    z-index: 30;
    right: 8px;
    bottom: calc(100% + 8px);
    display: none;
    width: max-content;
    max-width: calc(100% - 16px);
    max-height: min(50vh, 320px);
    overflow: auto;
    padding: 8px;
    border: 1px solid var(--theme-line);
    border-radius: 12px;
    background: var(--surface-raised);
    box-shadow: 0 8px 24px var(--shadow-color);
  }

  .is-open > .composer-settings-panel {
    display: grid;
    justify-items: start;
    gap: 8px;
  }
}
</style>
