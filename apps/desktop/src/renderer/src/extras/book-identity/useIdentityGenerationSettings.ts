import { computed, ref, watch, type Ref } from "vue";
import type {
  BookIdentityField,
  CoverAspectRatio,
  CoverTitleRendering
} from "@deepwrite/contracts/renderer";
import type { IdentityProfile } from "./useIdentityProfiles";

export function useIdentityGenerationSettings(
  field: Readonly<Ref<BookIdentityField>>,
  selected: Readonly<Ref<IdentityProfile | undefined>>,
  ratios: Readonly<Ref<readonly CoverAspectRatio[]>>
) {
  const settings = ref({
    title: { count: 8, brief: "" },
    synopsis: { count: 3, brief: "" },
    cover: { count: 3, brief: "" }
  });
  const count = computed({
    get: () => settings.value[field.value].count,
    set: (value: number) => {
      settings.value[field.value].count = value;
    }
  });
  const brief = computed({
    get: () => settings.value[field.value].brief,
    set: (value: string) => {
      settings.value[field.value].brief = value;
    }
  });
  const images = ref(1),
    ratio = ref<CoverAspectRatio>("3:4"),
    titleRendering = ref<CoverTitleRendering>("model"),
    autoRender = ref(true);
  const appliedProfiles = new Map<BookIdentityField, IdentityProfile>();
  watch(
    selected,
    (profile) => {
      if (!profile || appliedProfiles.get(field.value) === profile) return;
      appliedProfiles.set(field.value, profile);
      count.value = profile.candidateCount;
      if ("imagesPerCandidate" in profile) {
        images.value = profile.imagesPerCandidate;
        ratio.value = ratios.value.includes(profile.aspectRatio)
          ? profile.aspectRatio
          : (ratios.value[0] ?? "3:4");
        titleRendering.value = profile.titleRendering;
        autoRender.value = profile.autoRender;
      }
    },
    { immediate: true }
  );
  watch(ratios, (value) => {
    if (!value.includes(ratio.value)) ratio.value = value[0] ?? "3:4";
  });
  return { count, brief, images, ratio, titleRendering, autoRender };
}
