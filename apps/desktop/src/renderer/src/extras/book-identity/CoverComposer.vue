<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  appearanceCustomFontCssFamily,
  CoverLayoutSchema,
  type CoverImageRef,
  type CoverLayout,
  type ChatAssistantProjectRef
} from "@deepwrite/contracts/renderer";
import PopupSelect from "../../components/PopupSelect.vue";
import PresetManagerShell from "../analysis-ui/PresetManagerShell.vue";
import { useAppearance } from "../../composables/useAppearance";
import { useAppearanceFonts } from "../../composables/useAppearanceFonts";
import { coverUrl, identityT as t } from "./book-identity-utils";
import { composeCover, loadCoverImage } from "./cover-compose";
import { uiMessage } from "../../ui-feedback";
const props = defineProps<{
  open: boolean;
  book: ChatAssistantProjectRef;
  image: CoverImageRef;
  title: string;
  subtitle?: string | undefined;
  palette: readonly string[];
  saving: boolean;
}>();
const emit = defineEmits<{
  close: [];
  save: [layout: CoverLayout, pngBase64: string, adopt: boolean];
}>();
const fonts = useAppearanceFonts();
const appearance = useAppearance();
const colors = computed(() => [
  ...new Set([
    ...props.palette,
    "#ffffff",
    "#000000",
    appearance.activeTheme.value.accent
  ])
]);
const fontOptions = computed(() => {
  const choices = [
    { value: "Songti SC", label: t("song") },
    { value: "PingFang SC", label: t("hei") },
    { value: "Kaiti SC", label: t("kai") },
    ...fonts.fonts.value.map((f) => ({
      value: appearanceCustomFontCssFamily(f.id),
      label: f.displayName
    }))
  ];
  if (!choices.some((f) => f.value === layout.value.fontFamily))
    choices.push({ value: layout.value.fontFamily, label: t("savedFont") });
  return choices;
});
const layout = ref<CoverLayout>(
  CoverLayoutSchema.parse({
    template: "top-center",
    title: props.title,
    subtitle: props.subtitle ?? "",
    fontFamily: "Songti SC",
    fontSize: 72,
    color: props.palette[0] ?? "#ffffff"
  })
);
const preview = ref(""),
  loading = ref(false);
let sourceImage: HTMLImageElement | undefined;
let sequence = 0;
watch(
  () => [props.open, props.image.id] as const,
  async ([open]) => {
    if (!open) return;
    const current = ++sequence;
    sourceImage = undefined;
    preview.value = "";
    loading.value = true;
    layout.value = props.image.composed?.layout
      ? { ...props.image.composed.layout }
      : CoverLayoutSchema.parse({
          template: "top-center",
          title: props.title,
          subtitle: props.subtitle ?? "",
          fontFamily: "Songti SC",
          fontSize: 72,
          color: "#ffffff"
        });
    try {
      const loaded = await loadCoverImage(
        coverUrl(props.book, props.image.file)
      );
      if (current !== sequence) return;
      sourceImage = loaded;
      preview.value = await composeCover(loaded, layout.value);
    } catch {
      uiMessage.error(t("failedLoadImage"));
    } finally {
      if (current === sequence) loading.value = false;
    }
  },
  { immediate: true }
);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  layout,
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (sourceImage)
        void composeCover(sourceImage, layout.value)
          .then((value) => {
            preview.value = value;
          })
          .catch(() => uiMessage.error(t("failed")));
    }, 80);
  },
  { deep: true }
);
onBeforeUnmount(() => {
  sequence++;
  clearTimeout(timer);
});
async function save(adopt: boolean) {
  if (!sourceImage) return;
  try {
    const value = CoverLayoutSchema.parse(layout.value);
    const png = await composeCover(sourceImage, value);
    emit("save", value, png.split(",")[1]!, adopt);
  } catch {
    uiMessage.error(t("failed"));
  }
}
</script>
<template>
  <PresetManagerShell
    :open="open"
    :title="t('composer')"
    :close-label="t('close')"
    @close="emit('close')"
  >
    <div class="identity-composer">
      <div class="identity-composer-preview">
        <img v-if="preview" :src="preview" :alt="layout.title" /><span v-else>{{
          t("loading")
        }}</span>
      </div>
      <div class="identity-editor">
        <label
          >{{ t("layout")
          }}<PopupSelect
            :menu-z-index="3200"
            v-model="layout.template"
            :options="[
              { value: 'top-left', label: t('topLeft') },
              { value: 'top-center', label: t('topCenter') },
              { value: 'top-right', label: t('topRight') },
              { value: 'center-left', label: t('centerLeft') },
              { value: 'center-overlay', label: t('center') },
              { value: 'center-right', label: t('centerRight') },
              { value: 'bottom-left', label: t('bottomLeft') },
              { value: 'bottom-horizontal', label: t('bottom') },
              { value: 'bottom-right', label: t('bottomRight') },
              { value: 'left-vertical', label: t('leftVertical') },
              { value: 'right-vertical', label: t('vertical') }
            ]"
            :accessible-label="t('layout')"
        /></label>
        <label
          >{{ t("titleField")
          }}<input v-model="layout.title" maxlength="120" /></label
        ><label
          >{{ t("subtitle")
          }}<input v-model="layout.subtitle" maxlength="200" /></label
        ><label
          >{{ t("author") }}<input v-model="layout.author" maxlength="120"
        /></label>
        <label
          >{{ t("font")
          }}<PopupSelect
            :menu-z-index="3200"
            v-model="layout.fontFamily"
            :options="fontOptions"
            :accessible-label="t('font')"
        /></label>
        <label
          >{{ t("weight")
          }}<PopupSelect
            :menu-z-index="3200"
            v-model="layout.fontWeight"
            :options="[
              { value: 400, label: t('fontNormal') },
              { value: 700, label: t('fontBold') }
            ]"
            :accessible-label="t('weight')"
        /></label>
        <label
          >{{ t("color") }}<input v-model="layout.color" type="color" />
          <div class="identity-palette">
            <button
              v-for="color in colors"
              :key="color"
              :style="{ background: color }"
              :aria-label="color"
              @click="layout.color = color"
            /></div
        ></label>
        <label
          >{{ t("fontSize") }} · {{ layout.fontSize
          }}<input
            v-model.number="layout.fontSize"
            type="range"
            min="24"
            max="160"
        /></label>
        <label class="identity-check"
          ><input v-model="layout.stroke" type="checkbox" />{{
            t("stroke")
          }}</label
        ><label class="identity-check"
          ><input v-model="layout.shadow" type="checkbox" />{{
            t("shadow")
          }}</label
        >
      </div>
    </div>
    <template #footer
      ><button @click="emit('close')">{{ t("cancel") }}</button
      ><button :disabled="saving || loading || !preview" @click="save(false)">
        {{ t("saveComposition") }}</button
      ><button
        class="analysis-primary-button"
        :disabled="saving || loading || !preview"
        @click="save(true)"
      >
        {{ t("adoptCover") }}
      </button></template
    >
  </PresetManagerShell>
</template>
<style scoped src="./book-identity.css"></style>
