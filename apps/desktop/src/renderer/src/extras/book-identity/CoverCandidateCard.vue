<script setup lang="ts">
import { computed, ref } from "vue";
import type {
  BookCoverCandidate,
  ChatAssistantProjectRef,
  CoverImageRef
} from "@deepwrite/contracts/renderer";
import PopupSelect from "../../components/PopupSelect.vue";
import IdentityAdoptButton from "./IdentityAdoptButton.vue";
import { coverUrl, identityT as t } from "./book-identity-utils";
const props = defineProps<{
  candidate: BookCoverCandidate;
  book: ChatAssistantProjectRef;
  busy: boolean;
  disabled: boolean;
  saving?: boolean;
  adoptedImageId?: string | undefined;
}>();
const emit = defineEmits<{
  star: [];
  edit: [];
  render: [];
  compose: [image: CoverImageRef];
  adopt: [imageId: string];
  iterate: [];
  export: [imageId: string];
}>();
const selectedId = ref("");
const image = computed(
  () =>
    props.candidate.images.find((i) => i.id === selectedId.value) ??
    props.candidate.images.at(-1)
);
const options = computed(() =>
  props.candidate.images.map((i, index) => ({
    value: i.id,
    label: `${index + 1} · ${i.width} × ${i.height}`
  }))
);
</script>
<template>
  <article class="identity-candidate">
    <div class="identity-cover-image">
      <img
        v-if="image"
        :src="
          coverUrl(
            book,
            image.composed?.file ?? image.thumb,
            Date.parse(image.composed?.updatedAt ?? image.createdAt)
          )
        "
        :alt="candidate.concept"
      /><span v-else>{{
        busy
          ? t("rendering")
          : candidate.lastRenderError
            ? t("retry")
            : t("pending")
      }}</span
      ><span v-if="busy && image" class="identity-image-progress">{{
        t("rendering")
      }}</span>
    </div>
    <h3>{{ candidate.concept }}</h3>
    <div class="identity-row">
      <div class="identity-palette">
        <i
          v-for="color in candidate.palette"
          :key="color"
          :style="{ background: color }"
          :title="color"
        />
      </div>
      <small>{{ candidate.artStyle }}</small>
    </div>
    <p v-if="candidate.lastRenderError" class="identity-muted">
      {{ candidate.lastRenderError }}
    </p>
    <PopupSelect
      v-if="options.length > 1"
      :model-value="image?.id ?? ''"
      :options="options"
      :accessible-label="t('chooseImage')"
      @update:model-value="selectedId = String($event)"
    />
    <details>
      <summary>{{ t("viewPlan") }}</summary>
      <p>{{ candidate.scene }}</p>
      <p>{{ candidate.composition }}</p>
      <p>{{ candidate.typography }}</p>
      <p class="identity-prompt">{{ candidate.prompt }}</p>
      <p>{{ candidate.negativePrompt }}</p>
      <p>{{ candidate.rationale }}</p>
      <button
        :class="{ 'identity-save-pending': saving && !disabled && !busy }"
        :disabled="disabled || busy || saving"
        @click="emit('edit')"
      >
        {{ t("edit") }}
      </button>
    </details>
    <div class="identity-actions">
      <button
        :class="{ 'identity-save-pending': saving && !disabled && !busy }"
        :disabled="disabled || busy || saving"
        @click="emit('render')"
      >
        {{ candidate.images.length ? t("renderAgain") : t("render") }}</button
      ><button
        :class="{ 'identity-save-pending': saving && !disabled && !!image }"
        :disabled="disabled || !image || saving"
        @click="image && emit('compose', image)"
      >
        {{ t("compose") }}</button
      ><IdentityAdoptButton
        :adopted="!!image && image.id === adoptedImageId"
        :disabled="disabled || !image"
        :saving="saving"
        @adopt="image && emit('adopt', image.id)"
      /><button
        :class="{ 'identity-save-pending': saving && !disabled }"
        :disabled="disabled || saving"
        @click="emit('star')"
      >
        {{ candidate.starred ? t("unstar") : t("star") }}</button
      ><button @click="emit('iterate')">{{ t("iterate") }}</button
      ><button
        v-if="image"
        :class="{ 'identity-save-pending': saving && !disabled }"
        :disabled="disabled || saving"
        @click="emit('export', image.id)"
      >
        {{ t("export") }}
      </button>
    </div>
  </article>
</template>
<style scoped src="./book-identity.css"></style>
