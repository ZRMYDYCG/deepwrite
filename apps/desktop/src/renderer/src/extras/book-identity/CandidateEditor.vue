<script setup lang="ts">
import { ref, watch } from "vue";
import type {
  BookIdentityCandidate,
  BookIdentityField,
  BookIdentityUpdateCandidateInput
} from "@deepwrite/contracts/renderer";
import PresetManagerShell from "../analysis-ui/PresetManagerShell.vue";
import { identityT as t } from "./book-identity-utils";
const props = defineProps<{
  open: boolean;
  field: BookIdentityField;
  candidate?: BookIdentityCandidate | undefined;
  saving: boolean;
}>();
const emit = defineEmits<{
  close: [];
  save: [patch: BookIdentityUpdateCandidateInput["patch"]];
}>();
const draft = ref({
  title: "",
  subtitle: "",
  hook: "",
  text: "",
  angle: "",
  rationale: "",
  keywords: "",
  prompt: "",
  negativePrompt: ""
});
watch(
  () => props.open,
  (open) => {
    if (open) {
      const c = props.candidate;
      draft.value = {
        title: c && "title" in c ? c.title : "",
        subtitle: c && "title" in c ? (c.subtitle ?? "") : "",
        hook: c && "text" in c ? (c.hook ?? "") : "",
        text: c && "text" in c ? c.text : "",
        angle: c && "angle" in c ? c.angle : "",
        rationale: c?.rationale ?? "",
        keywords: c && "keywords" in c ? c.keywords.join(", ") : "",
        prompt: c && "prompt" in c ? c.prompt : "",
        negativePrompt: c && "prompt" in c ? (c.negativePrompt ?? "") : ""
      };
    }
  }
);
function save() {
  const d = draft.value;
  emit(
    "save",
    props.field === "title"
      ? {
          title: d.title,
          subtitle: d.subtitle,
          angle: d.angle,
          rationale: d.rationale,
          keywords: d.keywords
            .split(/[,，]/)
            .map((k) => k.trim())
            .filter(Boolean)
        }
      : props.field === "synopsis"
        ? { hook: d.hook, text: d.text, angle: d.angle, rationale: d.rationale }
        : { prompt: d.prompt, negativePrompt: d.negativePrompt }
  );
}
</script>
<template>
  <PresetManagerShell
    :open="open"
    :title="candidate ? t('edit') : t('addManual')"
    :close-label="t('close')"
    @close="emit('close')"
    ><form class="identity-editor" @submit.prevent="save">
      <template v-if="field === 'title'"
        ><label
          >{{ t("titleField")
          }}<input v-model="draft.title" maxlength="120" required /></label
        ><label
          >{{ t("subtitle")
          }}<input v-model="draft.subtitle" maxlength="200" /></label
        ><label
          >{{ t("keywords")
          }}<input v-model="draft.keywords" /></label></template
      ><template v-else-if="field === 'synopsis'"
        ><label
          >{{ t("hook") }}<input v-model="draft.hook" maxlength="240" /></label
        ><label
          >{{ t("text")
          }}<textarea
            v-model="draft.text"
            rows="9"
            maxlength="2000"
            required
          /></label></template
      ><template v-else
        ><label
          >{{ t("prompt")
          }}<textarea
            v-model="draft.prompt"
            rows="8"
            maxlength="8000"
            required
          /></label
        ><label
          >{{ t("negativePrompt")
          }}<textarea
            v-model="draft.negativePrompt"
            rows="3"
            maxlength="2000"
          /></label></template
      ><template v-if="field !== 'cover'"
        ><label
          >{{ t("angle")
          }}<input v-model="draft.angle" maxlength="120" /></label
        ><label
          >{{ t("rationale")
          }}<textarea
            v-model="draft.rationale"
            rows="3"
            maxlength="2000"
          /></label
      ></template>
    </form>
    <template #footer
      ><button @click="emit('close')">{{ t("cancel") }}</button
      ><button class="analysis-primary-button" :disabled="saving" @click="save">
        {{ t("save") }}
      </button></template
    ></PresetManagerShell
  >
</template>
<style scoped src="./book-identity.css"></style>
