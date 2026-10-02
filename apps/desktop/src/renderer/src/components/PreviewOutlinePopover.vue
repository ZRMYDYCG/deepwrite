<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type CSSProperties
} from "vue";
import { createId } from "@deepwrite/shared";
import {
  extractMarkdownHeadings,
  type MarkdownHeading
} from "../utils/markdownOutline";
import AppIcon from "./AppIcon.vue";

const t = createScopedTranslator("components.previewOutlinePopover");

const props = withDefaults(
  defineProps<{
    content: string;
    previewElement: HTMLElement | null;
    documentKey?: string;
    iconOnly?: boolean;
  }>(),
  { documentKey: "", iconOnly: false }
);

const trigger = ref<HTMLButtonElement | null>(null);
const card = ref<HTMLElement | null>(null);
const itemButtons = ref<Array<HTMLButtonElement | undefined>>([]);
const open = ref(false);
const cardStyle = ref<CSSProperties>({});
const cardId = createId("preview-outline");
const headings = computed(() => extractMarkdownHeadings(props.content));

function setItemButton(element: unknown, index: number): void {
  itemButtons.value[index] =
    element instanceof HTMLButtonElement ? element : undefined;
}

function headingStyle(heading: MarkdownHeading): CSSProperties {
  return { paddingLeft: `${10 + (heading.level - 1) * 13}px` };
}

function positionCard(): void {
  if (!open.value || !trigger.value || !card.value) return;

  const triggerRect = trigger.value.getBoundingClientRect();
  const viewportMargin = 8;
  const gap = 7;
  const availableWidth = Math.max(220, window.innerWidth - viewportMargin * 2);
  const width = Math.min(320, availableWidth);
  const spaceBelow = Math.max(
    0,
    window.innerHeight - triggerRect.bottom - gap - viewportMargin
  );
  const spaceAbove = Math.max(0, triggerRect.top - gap - viewportMargin);
  const estimatedHeight = Math.min(
    390,
    58 + Math.max(1, headings.value.length) * 37
  );
  const opensUpward =
    spaceBelow < Math.min(estimatedHeight, 190) && spaceAbove > spaceBelow;
  const availableHeight = opensUpward ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(118, Math.min(390, availableHeight));
  const renderedHeight = Math.min(card.value.scrollHeight, maxHeight);
  const left = Math.min(
    Math.max(viewportMargin, triggerRect.right - width),
    window.innerWidth - width - viewportMargin
  );
  const top = opensUpward
    ? triggerRect.top - gap - renderedHeight
    : triggerRect.bottom + gap;

  cardStyle.value = {
    top: `${Math.max(viewportMargin, top)}px`,
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
    transformOrigin: opensUpward ? "bottom right" : "top right"
  };
}

async function openCard(focusItem = false, fromEnd = false): Promise<void> {
  if (open.value) return;
  itemButtons.value = [];
  open.value = true;
  await nextTick();
  positionCard();
  if (focusItem && headings.value.length > 0) {
    const index = fromEnd ? headings.value.length - 1 : 0;
    itemButtons.value[index]?.focus();
  }
}

function closeCard(returnFocus = false): void {
  if (!open.value) return;
  open.value = false;
  if (returnFocus) nextTick(() => trigger.value?.focus());
}

function toggleCard(): void {
  if (open.value) closeCard();
  else void openCard();
}

function focusRelativeItem(direction: 1 | -1): void {
  if (headings.value.length === 0) return;
  const currentIndex = itemButtons.value.findIndex(
    (button) => button === document.activeElement
  );
  const baseIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex =
    (baseIndex + direction + headings.value.length) % headings.value.length;
  itemButtons.value[nextIndex]?.focus();
}

function handleTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && open.value) {
    event.preventDefault();
    closeCard();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    void openCard(true, event.key === "ArrowUp");
  }
}

function handleCardKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeCard(true);
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    focusRelativeItem(event.key === "ArrowDown" ? 1 : -1);
    return;
  }
  if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    const index = event.key === "Home" ? 0 : headings.value.length - 1;
    itemButtons.value[index]?.focus();
  }
}

function jumpToHeading(heading: MarkdownHeading): void {
  const preview = props.previewElement;
  const target = preview?.querySelector<HTMLElement>(
    `[data-markdown-heading-index="${heading.index}"]`
  );
  if (!preview || !target) return;

  const previewRect = preview.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = Math.max(
    0,
    preview.scrollTop + targetRect.top - previewRect.top - 8
  );

  closeCard();
  target.focus({ preventScroll: true });
  preview.scrollTo({ top, behavior: "smooth" });
}

function handleDocumentPointerdown(event: PointerEvent): void {
  const target = event.target;
  if (
    target instanceof Node &&
    !trigger.value?.contains(target) &&
    !card.value?.contains(target)
  ) {
    closeCard();
  }
}

function handleViewportChange(): void {
  if (open.value) positionCard();
}

watch(
  () => [props.content, props.documentKey, props.previewElement] as const,
  () => closeCard()
);

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerdown);
  document.addEventListener("scroll", handleViewportChange, true);
  window.addEventListener("resize", handleViewportChange);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerdown);
  document.removeEventListener("scroll", handleViewportChange, true);
  window.removeEventListener("resize", handleViewportChange);
});
</script>

<template>
  <span class="preview-outline-control" :class="{ 'is-open': open }">
    <button
      ref="trigger"
      class="preview-outline-trigger"
      :class="{ 'is-icon-only': iconOnly }"
      type="button"
      aria-haspopup="dialog"
      :aria-controls="open ? cardId : undefined"
      :aria-expanded="open"
      :aria-label="t('openDocumentOutline')"
      :title="t('outline')"
      @click="toggleCard"
      @keydown="handleTriggerKeydown"
    >
      <AppIcon name="outline" :size="iconOnly ? 16 : 13" />
      <span v-if="!iconOnly">{{ t("outline") }}</span>
    </button>

    <Teleport to="body">
      <Transition name="preview-outline-card">
        <section
          v-if="open"
          :id="cardId"
          ref="card"
          class="preview-outline-card"
          :style="cardStyle"
          role="dialog"
          :aria-label="t('documentOutline')"
          @keydown="handleCardKeydown"
        >
          <header class="preview-outline-heading">
            <div>
              <strong>{{ t("documentOutline") }}</strong>
              <span>{{
                t("headingsMessage", {
                  arg0: headings.length ?? ""
                })
              }}</span>
            </div>
          </header>
          <nav
            v-if="headings.length"
            class="preview-outline-list"
            :aria-label="t('manuscriptHeadings')"
          >
            <button
              v-for="(heading, index) in headings"
              :key="heading.index"
              :ref="(element) => setItemButton(element, index)"
              class="preview-outline-item"
              type="button"
              :style="headingStyle(heading)"
              :title="heading.label"
              @click="jumpToHeading(heading)"
            >
              <small>H{{ heading.level }}</small>
              <span>{{ heading.label }}</span>
            </button>
          </nav>
          <div v-else class="preview-outline-empty">
            <AppIcon name="outline" :size="18" />
            <span>{{ t("noMarkdownHeadingsInThisManuscript") }}</span>
          </div>
        </section>
      </Transition>
    </Teleport>
  </span>
</template>

<style scoped src="./preview-outline-popover.css"></style>
