<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { nextTick, ref, watch } from "vue";
import { uiMessage } from "../ui-feedback";

const t = createScopedTranslator("components.characterItemDialog");

const props = defineProps<{
  open: boolean;
  mode: "create" | "rename" | "delete";
  title: string;
  pending?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [title: string];
}>();

const value = ref("");
const input = ref<HTMLInputElement>();

watch(
  () => [props.open, props.title] as const,
  async ([open, title]) => {
    if (!open) return;
    value.value = props.mode === "create" ? "" : title;
    await nextTick();
    input.value?.focus({ preventScroll: true });
    input.value?.select();
  }
);

function close(): void {
  if (!props.pending) emit("close");
}

function submit(): void {
  if (props.pending) return;
  if (props.mode === "delete") {
    emit("submit", props.title);
    return;
  }
  const title = value.value.trim();
  if (!title) {
    uiMessage.warning(t("enterACharacterEntryName"));
    return;
  }
  emit("submit", title);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="dialog-backdrop character-item-dialog-overlay"
      @mousedown.self="close"
      @keydown.esc.stop="close"
    >
      <section
        class="character-item-dialog"
        :role="mode === 'delete' ? 'alertdialog' : 'dialog'"
        aria-modal="true"
        aria-labelledby="character-item-dialog-title"
      >
        <form @submit.prevent="submit">
          <header>
            <span>{{
              mode === "create"
                ? "CREATE"
                : mode === "rename"
                  ? "RENAME"
                  : "DELETE"
            }}</span>
            <h3 id="character-item-dialog-title">
              {{
                mode === "create"
                  ? t("newCharacterEntry")
                  : mode === "rename"
                    ? t("renameCharacterEntry")
                    : t("deleteValue", {
                        arg0: title
                      })
              }}
            </h3>
          </header>
          <div class="dialog-body">
            <p v-if="mode === 'delete'">
              {{ t("thisCharacterEntryAndItsMarkdownContentWillBe") }}
            </p>
            <label v-else>
              <span>{{ t("name") }}</span>
              <input
                ref="input"
                v-model="value"
                maxlength="256"
                autocomplete="off"
                :disabled="pending"
              />
            </label>
          </div>
          <footer>
            <button type="button" :disabled="pending" @click="close">
              {{ t("cancel") }}
            </button>
            <button
              :class="mode === 'delete' ? 'danger-button' : 'primary-button'"
              type="submit"
              :disabled="pending"
            >
              {{
                pending
                  ? t("processing")
                  : mode === "create"
                    ? t("create")
                    : mode === "rename"
                      ? t("saveChanges")
                      : t("delete")
              }}
            </button>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.character-item-dialog-overlay {
  z-index: 2400;
  padding: 1rem;
}
.character-item-dialog {
  width: min(28rem, 94vw);
  overflow: hidden;
  border: 1px solid var(--theme-line);
  border-radius: 0.9rem;
  background: var(--surface-raised);
  color: var(--text-primary);
  box-shadow: 0 22px 70px
    color-mix(in srgb, var(--text-primary) 18%, transparent);
}
header,
.dialog-body,
footer {
  padding: 1rem;
}
header {
  border-bottom: 1px solid var(--theme-line-soft);
  background: var(--surface-muted);
}
header span {
  color: var(--accent);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
}
h3,
p {
  margin: 0;
}
h3 {
  margin-top: 0.2rem;
  font-size: 1.05rem;
}
label {
  display: grid;
  gap: 0.45rem;
  color: var(--text-secondary);
}
input,
button {
  font: inherit;
}
input {
  min-height: 2.35rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--theme-line);
  border-radius: 0.55rem;
  background: var(--surface-main);
  color: var(--text-primary);
}
input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 0.2rem var(--accent-soft);
  outline: none;
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
  border-top: 1px solid var(--theme-line-soft);
}
button {
  min-height: 2.1rem;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--theme-line);
  border-radius: 0.55rem;
  background: var(--surface-raised);
  color: var(--text-secondary);
}
.primary-button {
  border-color: var(--neutral-solid);
  background: var(--neutral-solid);
  color: var(--accent-contrast);
}
.danger-button {
  border-color: var(--danger);
  background: var(--danger);
  color: white;
}
</style>
