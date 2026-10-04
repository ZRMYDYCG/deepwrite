import { computed, effectScope, nextTick, ref } from "vue";
import { expect, it } from "vitest";
import {
  BookTitleDesignProfileSchema,
  BookSynopsisDesignProfileSchema,
  BookCoverDesignProfileSchema,
  type BookIdentityField,
  type CoverAspectRatio
} from "@deepwrite/contracts/renderer";
import type { IdentityProfileCatalogs } from "./useIdentityProfiles";
import { useIdentityGenerationSettings } from "./useIdentityGenerationSettings";

function harness() {
  const base = {
    id: "default",
    name: "通用",
    description: "测试档案",
    systemPrompt: "测试设计方法"
  };
  const catalogs = ref<IdentityProfileCatalogs>({
    title: [BookTitleDesignProfileSchema.parse(base)],
    synopsis: [BookSynopsisDesignProfileSchema.parse(base)],
    cover: [BookCoverDesignProfileSchema.parse(base)]
  });
  const field = ref<BookIdentityField>("title");
  const selected = computed(() => catalogs.value[field.value][0]);
  const ratios = ref<CoverAspectRatio[]>(["3:4", "2:3", "16:9"]);
  const scope = effectScope();
  const settings = scope.run(() =>
    useIdentityGenerationSettings(field, selected, ratios)
  )!;
  return { field, catalogs, ratios, settings, scope };
}

it("retains separate counts and requirements when returning to each tab", async () => {
  const { field, settings, scope } = harness();
  try {
    settings.count.value = 12;
    settings.brief.value = "四字书名";
    field.value = "synopsis";
    await nextTick();
    expect(settings.count.value).toBe(3);
    expect(settings.brief.value).toBe("");
    settings.count.value = 2;
    settings.brief.value = "避免剧透";
    field.value = "cover";
    await nextTick();
    expect(settings.count.value).toBe(3);
    expect(settings.brief.value).toBe("");
    expect(settings.titleRendering.value).toBe("model");
    settings.count.value = 1;
    settings.brief.value = "水墨画风";
    settings.images.value = 4;
    settings.ratio.value = "2:3";
    settings.titleRendering.value = "overlay";
    settings.autoRender.value = false;
    field.value = "title";
    await nextTick();
    expect([settings.count.value, settings.brief.value]).toEqual([
      12,
      "四字书名"
    ]);
    field.value = "synopsis";
    await nextTick();
    expect([settings.count.value, settings.brief.value]).toEqual([
      2,
      "避免剧透"
    ]);
    field.value = "cover";
    await nextTick();
    expect([settings.count.value, settings.brief.value]).toEqual([
      1,
      "水墨画风"
    ]);
    expect(settings.images.value).toBe(4);
    expect(settings.ratio.value).toBe("2:3");
    expect(settings.titleRendering.value).toBe("overlay");
    expect(settings.autoRender.value).toBe(false);
  } finally {
    scope.stop();
  }
});

it("applies changed profile defaults to their field while preserving other edits", async () => {
  const { field, catalogs, settings, scope } = harness();
  try {
    settings.count.value = 10;
    settings.brief.value = "保留书名要求";
    catalogs.value.synopsis = [
      { ...catalogs.value.synopsis[0]!, candidateCount: 5 }
    ];
    field.value = "synopsis";
    await nextTick();
    expect(settings.count.value).toBe(5);
    settings.brief.value = "保留简介要求";
    catalogs.value.synopsis = [
      { ...catalogs.value.synopsis[0]!, candidateCount: 4 }
    ];
    await nextTick();
    expect(settings.count.value).toBe(4);
    expect(settings.brief.value).toBe("保留简介要求");
    field.value = "title";
    await nextTick();
    expect(settings.count.value).toBe(10);
    expect(settings.brief.value).toBe("保留书名要求");
  } finally {
    scope.stop();
  }
});

it("keeps cover ratios supported when the image model changes on another tab", async () => {
  const { field, ratios, settings, scope } = harness();
  try {
    field.value = "cover";
    await nextTick();
    settings.ratio.value = "2:3";
    field.value = "title";
    await nextTick();
    ratios.value = ["16:9"];
    await nextTick();
    field.value = "cover";
    await nextTick();
    expect(settings.ratio.value).toBe("16:9");
  } finally {
    scope.stop();
  }
});
