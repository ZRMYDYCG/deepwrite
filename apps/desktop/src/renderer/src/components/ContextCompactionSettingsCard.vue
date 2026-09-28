<script setup lang="ts">
import { computed } from "vue";
import type {
  ContextCompactionSettings,
  ModelSettings
} from "@deepwrite/contracts";
import PopupSelect from "./PopupSelect.vue";

const props = defineProps<{
  settings: ContextCompactionSettings;
  modelSettings: ModelSettings | null;
}>();

const emit = defineEmits<{
  update: [settings: ContextCompactionSettings];
}>();

const FOLLOW_RUN_MODEL = "";

const budgetOptions = [
  { value: 64_000, label: "6.4 万 tokens（省钱，适合短会话）" },
  { value: 128_000, label: "12.8 万 tokens" },
  { value: 160_000, label: "16 万 tokens（推荐）" },
  { value: 256_000, label: "25.6 万 tokens" },
  { value: 400_000, label: "40 万 tokens" },
  { value: 1_000_000, label: "100 万 tokens（以模型上限为准）" }
];

const budgetSelectOptions = computed(() =>
  budgetOptions.some((option) => option.value === props.settings.budgetTokens)
    ? budgetOptions
    : [
        ...budgetOptions,
        {
          value: props.settings.budgetTokens,
          label: `${props.settings.budgetTokens.toLocaleString("zh-CN")} tokens`
        }
      ]
);

const modelOptions = computed(() => {
  const settings = props.modelSettings;
  const enabledFree = new Set(settings?.deepwriteFreeEnabledModelIds ?? []);
  const models = [
    ...(settings?.models ?? []),
    ...(settings?.deepwriteFreeModels ?? []).filter((model) =>
      enabledFree.has(model.id)
    )
  ];
  const options = [
    { value: FOLLOW_RUN_MODEL, label: "跟随当前对话模型" },
    ...models.map((model) => ({ value: model.id, label: model.label }))
  ];
  const selected = props.settings.modelId;
  return selected && !options.some((option) => option.value === selected)
    ? [...options, { value: selected, label: "已删除的模型（将跟随对话模型）" }]
    : options;
});

function update(patch: Partial<ContextCompactionSettings>): void {
  const next: ContextCompactionSettings = { ...props.settings, ...patch };
  if (!next.modelId) delete next.modelId;
  emit("update", next);
}
</script>

<template>
  <h2 class="settings-group-title">上下文压缩</h2>
  <div class="settings-card">
    <label class="settings-item">
      <span class="settings-item-text"
        ><strong>自动压缩上下文</strong
        ><small
          >长对话接近工作预算时，先精简旧的读取结果与快照，再把较早的对话整理成检查点；作品正文不受影响。关闭后仍可在输入框中手动压缩。</small
        ></span
      >
      <span class="settings-toggle"
        ><input
          type="checkbox"
          :checked="settings.enabled"
          aria-label="自动压缩上下文"
          @change="
            update({ enabled: ($event.target as HTMLInputElement).checked })
          "
      /></span>
    </label>
    <div class="settings-item settings-select-item">
      <span class="settings-item-text"
        ><strong>工作预算</strong
        ><small
          >即使模型窗口更大，也把上下文控制在此范围内，避免长上下文稀释要求、抬高成本</small
        ></span
      >
      <PopupSelect
        class="general-select-control"
        :model-value="settings.budgetTokens"
        :options="budgetSelectOptions"
        accessible-label="选择上下文工作预算"
        align="end"
        :menu-min-width="260"
        @update:model-value="update({ budgetTokens: Number($event) })"
      />
    </div>
    <div class="settings-item settings-select-item">
      <span class="settings-item-text"
        ><strong>摘要模型</strong
        ><small>生成压缩检查点所用的模型；可选择更便宜的模型</small></span
      >
      <PopupSelect
        class="general-select-control"
        :model-value="settings.modelId ?? FOLLOW_RUN_MODEL"
        :options="modelOptions"
        accessible-label="选择上下文摘要模型"
        align="end"
        :menu-min-width="238"
        @update:model-value="update({ modelId: String($event) })"
      />
    </div>
  </div>
</template>
