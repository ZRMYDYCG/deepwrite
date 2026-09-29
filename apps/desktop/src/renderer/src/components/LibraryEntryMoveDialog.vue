<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from "vue";
import type { MaterialStageId } from "@deepwrite/contracts";
import PopupSelect from "./PopupSelect.vue";

const t = createScopedTranslator("components.libraryEntryMoveDialog");

const props = defineProps<{
  open: boolean;
  entryTitle: string;
  targetLibraryTitle: string;
  options: readonly { value: MaterialStageId; label: string }[];
  initialStageId: MaterialStageId;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [stageId: MaterialStageId];
}>();

const stageId = ref<MaterialStageId>(props.initialStageId);
const heading = computed(() => t("moveValue", { arg0: props.entryTitle }));

function requestClose(): void {
  if (!props.submitting) emit("close");
}

function submit(): void {
  if (!props.submitting) emit("submit", stageId.value);
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === "Escape") requestClose();
}

watch(
  () => [props.open, props.initialStageId, props.options] as const,
  ([open, initialStageId, options]) => {
    if (!open) return;
    stageId.value = options.some(({ value }) => value === initialStageId)
      ? initialStageId
      : (options[0]?.value ?? initialStageId);
    void nextTick();
  },
  { immediate: true }
);

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @mousedown.self="requestClose">
      <section
        class="workspace-dialog library-entry-move-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-entry-move-title"
      >
        <header>
          <div>
            <span class="dialog-eyebrow">{{
              t("materialLibraryChangeCategory")
            }}</span>
            <h2 id="library-entry-move-title">{{ heading }}</h2>
          </div>
          <button
            class="dialog-close"
            type="button"
            :aria-label="t('close')"
            :disabled="submitting"
            @click="requestClose"
          >
            ×
          </button>
        </header>
        <form
          class="dialog-content catalog-resource-form"
          @submit.prevent="submit"
        >
          <p class="dialog-description">
            {{
              t("theTargetMaterialLibraryUsesDifferentCategoriesMessage", {
                arg0: targetLibraryTitle ?? ""
              })
            }}
          </p>
          <label class="book-resource-name-field catalog-resource-stage-field">
            <span>{{ t("contentStage") }}</span>
            <PopupSelect
              v-model="stageId"
              :options="options"
              :accessible-label="t('contentStageAfterMove')"
              size="large"
              :disabled="submitting"
              :menu-min-width="220"
            />
          </label>
          <div class="dialog-actions">
            <button
              class="dialog-secondary-button"
              type="button"
              :disabled="submitting"
              @click="requestClose"
            >
              {{ t("cancel") }}
            </button>
            <button
              class="dialog-primary-button"
              type="submit"
              :disabled="submitting"
            >
              {{ submitting ? t("moving") : t("move") }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>
