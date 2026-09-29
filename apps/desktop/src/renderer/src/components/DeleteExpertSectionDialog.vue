<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { computed, onBeforeUnmount, onMounted } from "vue";
import AppIcon from "./AppIcon.vue";

const t = createScopedTranslator("components.deleteExpertSectionDialog");

const props = defineProps<{
  open: boolean;
  sectionTitle: string;
  hasContent: boolean;
  workspaceType?: "short" | "script" | undefined;
}>();

const unitLabel = computed(() =>
  props.workspaceType === "script" ? t("episode") : t("section")
);

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();

function handleKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === "Escape") emit("close");
}

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @mousedown.self="emit('close')">
      <section
        class="workspace-dialog delete-expert-section-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-expert-section-title"
      >
        <header>
          <div>
            <span class="dialog-eyebrow">{{ t("manuscriptWriting") }}</span>
            <h2 id="delete-expert-section-title">
              {{
                t("deleteMessageDetail", {
                  arg0: unitLabel ?? ""
                })
              }}
            </h2>
          </div>
          <button
            class="dialog-close"
            type="button"
            :aria-label="t('close')"
            @click="emit('close')"
          >
            ×
          </button>
        </header>

        <div class="dialog-content">
          <div class="book-remove-warning">
            <AppIcon name="trash" :size="20" />
            <div>
              <strong>{{
                t("deleteMessageDetailDetail", { arg0: sectionTitle ?? "" })
              }}</strong>
              <p>
                {{
                  t("clickApplyOnTheRightToSaveMessage", {
                    arg0:
                      (hasContent
                        ? t("thisValueSTitleManuscriptAndCharacterStateWill", {
                            arg0: unitLabel
                          })
                        : t("thisEmptyValueWillBeRemovedFromTheManuscript", {
                            arg0: unitLabel
                          })) ?? ""
                  })
                }}
              </p>
            </div>
          </div>

          <div class="dialog-actions">
            <button
              class="dialog-secondary-button"
              type="button"
              @click="emit('close')"
            >
              {{ t("cancel") }}
            </button>
            <button
              class="dialog-primary-button is-danger"
              type="button"
              @click="emit('confirm')"
            >
              {{ t("deleteMessage") }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
