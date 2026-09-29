<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { onBeforeUnmount, onMounted, ref } from "vue";

const t = createScopedTranslator("components.windowHelpDialog");
const emit = defineEmits<{ close: [] }>();
const close = ref<HTMLButtonElement | null>(null);
let previous: HTMLElement | null = null;
onMounted(() => {
  previous = document.activeElement as HTMLElement | null;
  close.value?.focus();
});
onBeforeUnmount(() => {
  previous?.focus();
});
</script>
<template>
  <Teleport to="body">
    <div class="dialog-backdrop" @mousedown.self="emit('close')">
      <section
        class="dialog-card window-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="window-help-title"
        @keydown.esc.stop="emit('close')"
        @keydown.tab.prevent="close?.focus()"
      >
        <div class="dialog-header">
          <h2 id="window-help-title">
            {{ t("aboutDeepWrite") }}
          </h2>
        </div>
        <div class="dialog-content">
          <p>
            {{ t("deepWriteIsAWritingWorkspaceForLocalWorksAnd") }}
          </p>
          <p>
            {{ t("createOrOpenAWorkFromFileThenChoose") }}
          </p>
          <p>
            {{ t("changePaneLayoutFromViewOrOpenAppearanceSettings") }}
          </p>
          <p>
            {{ t("pressF10ToFocusTheMenuUseArrowKeys") }}
          </p>
          <p>
            {{ t("closingTheWindowFollowsGeneralSettingsWhenTheTray") }}
          </p>
        </div>
        <div class="dialog-footer">
          <button
            ref="close"
            class="primary-button"
            type="button"
            @click="emit('close')"
          >
            {{ t("close") }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
