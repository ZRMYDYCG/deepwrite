<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const t = createScopedTranslator("components.createCustomProviderDialog");

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [name: string];
}>();

const nameDraft = ref("");
const nameInput = ref<HTMLInputElement | null>(null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    nameDraft.value = "";
    void nextTick(() => nameInput.value?.focus());
  }
);

function requestClose(): void {
  emit("close");
}

function submit(): void {
  emit("submit", nameDraft.value);
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === "Escape") requestClose();
}

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @mousedown.self="requestClose">
      <section
        class="workspace-dialog book-resource-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-custom-provider-title"
      >
        <header>
          <div>
            <span class="dialog-eyebrow">{{ t("modelSettings") }}</span>
            <h2 id="create-custom-provider-title">
              {{ t("newProvider") }}
            </h2>
          </div>
          <button
            class="dialog-close"
            type="button"
            :aria-label="t('close')"
            @click="requestClose"
          >
            ×
          </button>
        </header>

        <form class="dialog-content" @submit.prevent="submit">
          <label class="book-resource-name-field">
            <span>{{ t("name") }}</span>
            <input
              ref="nameInput"
              v-model="nameDraft"
              type="text"
              maxlength="120"
              autocomplete="off"
              :aria-label="t('providerName')"
              :placeholder="t('forExampleSiliconFlow')"
            />
          </label>
          <p class="book-resource-help">
            {{ t("thisNameIdentifiesTheProviderGroupInSettingsConfigure") }}
          </p>

          <div class="dialog-actions">
            <button
              class="dialog-secondary-button"
              type="button"
              @click="requestClose"
            >
              {{ t("cancel") }}
            </button>
            <button class="dialog-primary-button" type="submit">
              {{ t("create") }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>
