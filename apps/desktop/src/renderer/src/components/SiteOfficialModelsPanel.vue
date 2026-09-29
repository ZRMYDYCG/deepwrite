<script setup lang="ts">
import { createScopedTranslator, locale } from "../i18n";
import { computed, ref } from "vue";
import {
  type ModelConfig,
  type ModelConfigInput,
  type ModelSettings,
  type SiteOfficialQuota
} from "@deepwrite/contracts";
import { isDeepWriteSiteOfficialModel } from "@deepwrite/contracts/renderer";
import { uiMessage } from "../ui-feedback";
import AppIcon from "./AppIcon.vue";
import SiteOfficialQuotaMergeDialog from "./SiteOfficialQuotaMergeDialog.vue";
import { useSettingsStore } from "../stores/settingsStore";
import { useSiteOfficialQuotaMerge } from "../composables/useSiteOfficialQuotaMerge";
import { toModelInput } from "./modelSettingsDraft";

const t = createScopedTranslator("components.siteOfficialModelsPanel");

const props = defineProps<{
  settings: ModelSettings | null;
  saving: boolean;
  refreshing: boolean;
  quota: SiteOfficialQuota | null;
  testingModelId: string | null;
}>();

const emit = defineEmits<{
  saveToken: [apiKey: string];
  clearToken: [];
  refresh: [];
  setModelEnabled: [payload: { modelId: string; enabled: boolean }];
  test: [model: ModelConfigInput];
}>();

const quotaMerge = useSiteOfficialQuotaMerge({
  api: () => window.deepwrite,
  settingsStore: useSettingsStore(),
  notifications: uiMessage
});
const {
  open: mergeOpen,
  sourceKey,
  pending: mergePending,
  disabledReason: mergeDisabledReason
} = quotaMerge;
const controlsBusy = computed(
  () =>
    props.saving || props.refreshing || mergeOpen.value || mergePending.value
);
const tokenEditorOpen = ref(false);
const tokenDraft = ref("");
const configuredModels = computed(
  () => props.settings?.models.filter(isDeepWriteSiteOfficialModel) ?? []
);
const tokenConfigured = computed(() =>
  configuredModels.value.some((model) => model.hasApiKey)
);
const enabledModelCount = computed(
  () => configuredModels.value.filter((model) => model.enabled !== false).length
);
const quotaUsedPercentage = computed(() => {
  if (!props.quota || props.quota.unlimited || !props.quota.total) return 0;
  return Math.min(
    100,
    Math.max(0, (props.quota.used / props.quota.total) * 100)
  );
});

function openTokenEditor(): void {
  tokenDraft.value = "";
  tokenEditorOpen.value = true;
}

function closeTokenEditor(): void {
  tokenDraft.value = "";
  tokenEditorOpen.value = false;
}

function submitToken(): void {
  const apiKey = tokenDraft.value.trim();
  if (!apiKey) {
    uiMessage.warning(t("enterAnOfficialSiteModelKey"));
    return;
  }
  emit("saveToken", apiKey);
  closeTokenEditor();
}

function testModel(model: ModelConfig): void {
  emit("test", toModelInput(model));
}

function toggleModel(model: ModelConfig): void {
  emit("setModelEnabled", {
    modelId: model.id,
    enabled: model.enabled === false
  });
}

function formatPrice(value: number | undefined): string {
  return value === undefined ? "--" : `¥${value}`;
}

function formatQuota(value: number | null | undefined): string {
  if (value === undefined || value === null) return "--";
  return new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function quotaSummary(): string {
  if (!props.quota) {
    return tokenConfigured.value
      ? t("quotaInformationIsUnavailableRefreshThePageUsingThe")
      : t("addAModelKeyToViewQuotaProgress");
  }
  if (props.quota.unlimited) return t("theCurrentKeyHasUnlimitedQuota");
  return t("valueOfQuotaUsed", {
    arg0: quotaUsedPercentage.value.toFixed(1)
  });
}
</script>

<template>
  <section class="site-models-panel" aria-labelledby="site-models-title">
    <header class="site-models-header">
      <div>
        <span class="site-models-kicker">
          <AppIcon name="model" :size="15" />
          {{ t("deepWriteOfficialSite") }}
        </span>
        <h2 id="site-models-title">
          {{ t("officialSiteModelsAndKey") }}
        </h2>
        <p>
          {{ t("connectToTheDeepWriteApiGatewayUsingAModelKey") }}
        </p>
      </div>
      <div class="site-models-header-actions">
        <a
          class="site-shop-button"
          href="https://pay.ldxp.cn/shop/UKGFTY58"
          target="_blank"
          rel="noopener noreferrer"
          :title="t('openSiteStoreInBrowser')"
        >
          <AppIcon name="globe" :size="15" />
          {{ t("siteStore") }}
        </a>
        <button
          class="site-models-refresh"
          type="button"
          :disabled="controlsBusy || !tokenConfigured"
          @click="emit('refresh')"
        >
          <AppIcon name="history" :size="15" />
          {{ refreshing ? t("refreshing") : t("refreshPage") }}
        </button>
      </div>
    </header>

    <section
      class="site-token-card"
      :class="{ 'is-configured': tokenConfigured }"
    >
      <div class="site-token-status">
        <span class="site-token-icon">
          <AppIcon name="model" :size="20" />
        </span>
        <div>
          <strong>{{
            tokenConfigured ? t("siteKeyAdded") : t("addYourSiteKey")
          }}</strong>
          <small>
            {{
              tokenConfigured
                ? t("valueModelsEnabledTheKeyIsNeverReturnedTo", {
                    arg0: enabledModelCount
                  })
                : t("relatedModelsJoinTheListAfterYouSaveA")
            }}
          </small>
        </div>
        <span class="site-token-badge">
          {{ tokenConfigured ? t("configured") : t("notConfigured") }}
        </span>
      </div>

      <form
        v-if="tokenEditorOpen"
        class="site-token-form"
        @submit.prevent="submitToken"
      >
        <label>
          <span>{{ t("modelKey") }}</span>
          <input
            v-model="tokenDraft"
            type="password"
            autocomplete="new-password"
            :placeholder="t('enterOfficialSiteModelKey')"
            :disabled="controlsBusy"
          />
        </label>
        <div class="site-token-form-actions">
          <button
            type="button"
            :disabled="controlsBusy"
            @click="closeTokenEditor"
          >
            {{ t("cancel") }}
          </button>
          <button class="is-primary" type="submit" :disabled="controlsBusy">
            {{
              saving
                ? t("saving")
                : tokenConfigured
                  ? t("updateKey")
                  : t("addKey")
            }}
          </button>
        </div>
      </form>

      <div v-else class="site-token-actions">
        <button
          class="is-primary"
          type="button"
          :disabled="controlsBusy"
          @click="openTokenEditor"
        >
          <AppIcon name="plus" :size="15" />
          {{ tokenConfigured ? t("replaceKey") : t("addKey") }}
        </button>
        <button
          v-if="tokenConfigured"
          class="is-remove"
          type="button"
          :disabled="controlsBusy"
          @click="emit('clearToken')"
        >
          {{ t("removeKey") }}
        </button>
      </div>
    </section>

    <section class="site-quota-card" :aria-label="t('officialSiteKeyQuota')">
      <div class="site-quota-heading">
        <div>
          <span>{{ t("currentKeyBalance") }}</span>
          <strong>{{
            quota?.unlimited
              ? t("unlimitedQuota")
              : formatQuota(quota?.remaining)
          }}</strong>
        </div>
        <div>
          <span>{{ t("usedTotalQuota") }}</span>
          <strong>
            {{
              quota?.unlimited
                ? t("valueUnlimited", {
                    arg0: formatQuota(quota.used)
                  })
                : `${formatQuota(quota?.used)} / ${formatQuota(quota?.total)}`
            }}
          </strong>
        </div>
      </div>
      <div
        v-if="!quota?.unlimited"
        class="site-quota-track"
        role="progressbar"
        :aria-label="t('currentKeyQuotaProgress')"
        :aria-valuenow="quota ? quotaUsedPercentage : undefined"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <span :style="{ width: `${quotaUsedPercentage}%` }" />
      </div>
      <div class="site-quota-footer">
        <small>{{ quotaSummary() }}</small>
        <button
          class="site-models-refresh"
          type="button"
          :disabled="!!mergeDisabledReason || controlsBusy"
          :title="
            mergeDisabledReason || t('transferTheSourceKeySRemainingQuotaToThe')
          "
          @click="quotaMerge.show"
        >
          {{ t("addQuota") }}
        </button>
      </div>
    </section>

    <section class="site-model-card" aria-labelledby="site-model-list-title">
      <header>
        <div>
          <span>{{ t("modelCatalog") }}</span>
          <h3 id="site-model-list-title">
            {{ t("modelsFromTheOfficialSite") }}
          </h3>
        </div>
        <span>
          {{
            configuredModels.length
              ? t("valueModels", {
                  arg0: configuredModels.length
                })
              : t("awaitingConfiguration")
          }}
        </span>
      </header>

      <article
        v-for="model in configuredModels"
        :key="model.id"
        class="site-model-row"
      >
        <span class="site-model-logo">{{
          model.label.slice(0, 1).toUpperCase()
        }}</span>
        <div class="site-model-details">
          <div class="site-model-title-row">
            <strong>{{ model.label }}</strong>
            <span class="site-model-available">{{ t("available") }}</span>
          </div>
          <small>
            {{ model.provider }} · {{ model.modelId }} · {{ model.api }}
          </small>
          <small>{{ model.baseUrl }}</small>
          <small>
            {{
              t("inputOutputCachePerMillionTokensMessage", {
                arg0: formatPrice(model.input) ?? "",
                arg1: formatPrice(model.output) ?? "",
                arg2: formatPrice(model.cache) ?? ""
              })
            }}
          </small>
        </div>
        <div class="site-model-actions">
          <button
            class="site-model-test"
            type="button"
            :disabled="controlsBusy || testingModelId !== null"
            @click="testModel(model)"
          >
            {{
              testingModelId === model.id ? t("testing") : t("testConnection")
            }}
          </button>
          <button
            class="site-model-toggle"
            type="button"
            role="switch"
            :aria-checked="model.enabled !== false"
            :aria-label="
              t('valueEnabledStatus', {
                arg0: model.label
              })
            "
            :disabled="controlsBusy"
            @click="toggleModel(model)"
          >
            <span />
          </button>
        </div>
      </article>
      <p v-if="configuredModels.length === 0" class="site-model-empty">
        {{ t("officialSiteModelsAppearHereAfterYouAddA") }}
      </p>
    </section>
    <SiteOfficialQuotaMergeDialog
      v-if="mergeOpen"
      v-model:source-key="sourceKey"
      :pending="mergePending"
      @close="quotaMerge.close"
      @submit="quotaMerge.submit"
    />
  </section>
</template>

<style scoped src="./site-official-models-panel.css"></style>
