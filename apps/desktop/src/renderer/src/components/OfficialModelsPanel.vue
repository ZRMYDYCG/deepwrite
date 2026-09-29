<script setup lang="ts">
import { createScopedTranslator, locale } from "../i18n";
import { computed, ref, watch } from "vue";
import type {
  ModelSettings,
  ModelUsageDashboard,
  ModelUsageTotals,
  OfficialModelBalance
} from "@deepwrite/contracts";
import { uiMessage } from "../ui-feedback";
import AppIcon from "./AppIcon.vue";

const t = createScopedTranslator("components.officialModelsPanel");

const props = defineProps<{
  settings: ModelSettings | null;
  dashboard: ModelUsageDashboard | null;
  balance: OfficialModelBalance | null;
  loading: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  load: [];
  saveToken: [apiKey: string];
  clearToken: [];
  setModelEnabled: [payload: { modelId: string; enabled: boolean }];
}>();

const tokenEditorOpen = ref(false);
const tokenDraft = ref("");
const tokenConfigured = computed(
  () => props.settings?.deepwriteOfficialTokenConfigured === true
);
const officialModels = computed(
  () => props.settings?.deepwriteOfficialModels ?? []
);
const enabledModelIds = computed(
  () =>
    new Set(
      props.settings?.deepwriteOfficialEnabledModelIds ??
        officialModels.value.map((model) => model.id)
    )
);
const enabledModelCount = computed(() => enabledModelIds.value.size);
const totalUsed = computed(() => props.dashboard?.totals.totalTokens ?? 0);
const currentKeyUsagePercentage = computed(() => {
  const granted = props.balance?.currentKeyGrantedYuan;
  const used = props.balance?.currentKeyUsedYuan;
  if (granted === undefined || used === undefined || granted <= 0) return null;
  return Math.min(100, Math.max(0, (used / granted) * 100));
});

const EMPTY_TOTALS: ModelUsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
  requestCount: 0
};

const modelRows = computed(() =>
  officialModels.value.map((model) => ({
    model,
    totals:
      props.dashboard?.models.find(
        (summary) => summary.model.configId === model.id
      )?.totals ?? EMPTY_TOTALS
  }))
);

watch(tokenConfigured, (configured) => {
  if (!configured) return;
  tokenDraft.value = "";
  tokenEditorOpen.value = false;
});

function openTokenEditor(): void {
  tokenDraft.value = "";
  tokenEditorOpen.value = true;
}

function submitToken(): void {
  const apiKey = tokenDraft.value.trim();
  if (!apiKey) {
    uiMessage.warning(t("enterAnOfficialToken"));
    return;
  }
  emit("saveToken", apiKey);
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat(locale.value, {
    maximumFractionDigits: 0
  }).format(Math.max(0, Number.isFinite(value) ? value : 0));
}

function formatYuan(value: number): string {
  return new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function cacheTokens(totals: ModelUsageTotals): number {
  return totals.cacheReadTokens + totals.cacheWriteTokens;
}

function isModelAvailable(status: 0 | 1 | undefined): boolean {
  return status !== 1;
}

function formatDiscount(discount: number | undefined): string {
  if (discount === undefined) return "--";
  if (discount === 1) return t("fullPrice");
  return t("value10OfListPrice", {
    arg0: new Intl.NumberFormat(locale.value, {
      maximumFractionDigits: 2
    }).format(discount * 10)
  });
}

function formatPrice(value: number | undefined): string {
  if (value === undefined) return "--";
  return `¥${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 4 }).format(value)}`;
}
</script>

<template>
  <section
    class="official-models-panel"
    aria-labelledby="official-models-title"
  >
    <header class="official-models-header">
      <div>
        <span class="official-models-kicker">
          <AppIcon name="model" :size="15" />
          {{ t("deepWriteLegacyOfficialManagedAccess") }}
        </span>
        <h2 id="official-models-title">
          {{ t("legacyOfficialModelsAndToken") }}
        </h2>
        <p>
          {{ t("legacyOfficialModelsConnectDirectlyToChineseModelProviders") }}
        </p>
      </div>
      <div class="official-models-header-actions">
        <a
          class="official-shop-button"
          href="https://pay.ldxp.cn/shop/UKGFTY58"
          target="_blank"
          rel="noopener noreferrer"
          :title="t('openOfficialModelStoreInBrowser')"
        >
          <AppIcon name="globe" :size="15" />
          {{ t("store") }}
        </a>
        <button
          class="official-refresh-button"
          type="button"
          :disabled="loading"
          @click="emit('load')"
        >
          <AppIcon name="history" :size="15" />
          {{ loading ? t("refreshing") : t("refresh") }}
        </button>
      </div>
    </header>

    <section
      class="official-token-card"
      :class="{ 'is-configured': tokenConfigured }"
    >
      <div class="official-token-status">
        <span class="official-token-icon"
          ><AppIcon name="model" :size="20"
        /></span>
        <div>
          <strong>{{
            tokenConfigured
              ? t("officialTokenAdded")
              : t("addYourOfficialToken")
          }}</strong>
          <small>
            {{
              tokenConfigured
                ? t("valueOfficialModelsEnabledTheTokenIsNeverReturned", {
                    arg0: enabledModelCount
                  })
                : t("afterAddingATokenOfficialModelsAppearAtThe")
            }}
          </small>
        </div>
        <span class="official-token-badge">{{
          tokenConfigured ? t("enabled") : t("notAdded")
        }}</span>
      </div>

      <form
        v-if="tokenEditorOpen"
        class="official-token-form"
        @submit.prevent="submitToken"
      >
        <label>
          <span>{{ t("officialToken") }}</span>
          <input
            v-model="tokenDraft"
            type="password"
            autocomplete="new-password"
            :placeholder="t('enterOfficialToken')"
            :disabled="saving"
          />
        </label>
        <div class="official-token-form-actions">
          <button
            type="button"
            :disabled="saving"
            @click="
              tokenEditorOpen = false;
              tokenDraft = '';
            "
          >
            {{ t("cancel") }}
          </button>
          <button class="is-primary" type="submit" :disabled="saving">
            {{
              saving
                ? t("saving")
                : tokenConfigured
                  ? t("updateToken")
                  : t("addToken")
            }}
          </button>
        </div>
      </form>

      <div v-else class="official-token-actions">
        <button
          class="is-primary"
          type="button"
          :disabled="saving"
          @click="openTokenEditor"
        >
          <AppIcon name="plus" :size="15" />
          {{ tokenConfigured ? t("replaceToken") : t("addToken") }}
        </button>
        <button
          v-if="tokenConfigured"
          type="button"
          class="is-remove"
          :disabled="saving"
          @click="emit('clearToken')"
        >
          {{ t("removeToken") }}
        </button>
      </div>
    </section>

    <section
      class="official-quota-card"
      :aria-label="t('officialModelUsageAndSpending')"
    >
      <div class="official-quota-heading official-usage-summary">
        <div>
          <span>{{ t("tokensUsedOnThisDevice") }}</span>
          <strong>{{ formatTokens(totalUsed) }}</strong>
        </div>
        <div class="official-quota-remaining">
          <span>{{ t("currentKeySpending") }}</span>
          <strong>
            {{
              balance?.currentKeyUnlimited
                ? t("unlimitedQuota")
                : balance?.currentKeyUsedYuan === undefined ||
                    balance?.currentKeyGrantedYuan === undefined
                  ? "--"
                  : `${formatYuan(balance.currentKeyUsedYuan)} / ${formatYuan(balance.currentKeyGrantedYuan)}`
            }}
          </strong>
        </div>
      </div>
      <div
        v-if="currentKeyUsagePercentage !== null"
        class="official-cost-track"
        role="progressbar"
        :aria-label="t('currentKeySpendingProgress')"
        :aria-valuenow="currentKeyUsagePercentage"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <span :style="{ width: `${currentKeyUsagePercentage}%` }" />
      </div>
      <div class="official-balance-details">
        <span>{{ t("deviceTokenCountsComeFromTheLocalLedger") }}</span>
        <span v-if="balance?.currentKeyUnlimited">{{
          t("currentKeyHasUnlimitedQuota")
        }}</span>
        <span v-else-if="balance?.currentKeyRemainingYuan !== undefined">
          {{
            t("currentKeyBalanceMessage", {
              arg0: formatYuan(balance.currentKeyRemainingYuan) ?? ""
            })
          }}
        </span>
        <span v-else>{{ t("currentKeySpendingInformationUnavailable") }}</span>
      </div>
    </section>

    <section
      class="official-model-list-card"
      aria-labelledby="official-model-list-title"
    >
      <header>
        <div>
          <span>{{ t("currentlySupported") }}</span>
          <h3 id="official-model-list-title">
            {{ t("supportedModels") }}
          </h3>
        </div>
        <span>{{
          t("modelsMessage", {
            arg0: officialModels.length ?? ""
          })
        }}</span>
      </header>

      <div v-if="loading && !settings" class="official-model-state">
        {{ t("loadingOfficialModels") }}
      </div>
      <div v-else class="official-model-table-wrap">
        <table class="official-model-table">
          <thead>
            <tr>
              <th scope="col">
                {{ t("model") }}
              </th>
              <th scope="col">
                {{ t("totalUsage") }}
              </th>
              <th scope="col">
                {{ t("input") }}
              </th>
              <th scope="col">
                {{ t("output") }}
              </th>
              <th scope="col">
                {{ t("cache") }}
              </th>
              <th scope="col">
                {{ t("discount") }}
              </th>
              <th scope="col">
                {{ t("price") }}
              </th>
              <th scope="col">
                {{ t("enable") }}
              </th>
              <th scope="col">
                {{ t("status") }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in modelRows" :key="row.model.id">
              <td>
                <strong>{{ row.model.label }}</strong>
                <small>{{ row.model.modelId }}</small>
              </td>
              <td>{{ formatTokens(row.totals.totalTokens) }}</td>
              <td>{{ formatTokens(row.totals.inputTokens) }}</td>
              <td>{{ formatTokens(row.totals.outputTokens) }}</td>
              <td>
                <strong>{{ formatTokens(cacheTokens(row.totals)) }}</strong>
                <small>{{
                  t("readWriteMessage", {
                    arg0: formatTokens(row.totals.cacheReadTokens) ?? "",
                    arg1: formatTokens(row.totals.cacheWriteTokens) ?? ""
                  })
                }}</small>
              </td>
              <td>{{ formatDiscount(row.model.discount) }}</td>
              <td class="official-model-price">
                <span>{{
                  t("inputMessage", {
                    arg0: formatPrice(row.model.input) ?? ""
                  })
                }}</span>
                <span>{{
                  t("outputMessage", {
                    arg0: formatPrice(row.model.output) ?? ""
                  })
                }}</span>
                <span>{{
                  t("cacheMessage", {
                    arg0: formatPrice(row.model.cache) ?? ""
                  })
                }}</span>
                <small>{{ t("cNYMillionTokens") }}</small>
              </td>
              <td>
                <button
                  class="official-model-toggle"
                  type="button"
                  role="switch"
                  :aria-checked="enabledModelIds.has(row.model.id)"
                  :aria-label="
                    t('valueEnabledStatus', {
                      arg0: row.model.label
                    })
                  "
                  :disabled="saving || !isModelAvailable(row.model.status)"
                  @click="
                    emit('setModelEnabled', {
                      modelId: row.model.id,
                      enabled: !enabledModelIds.has(row.model.id)
                    })
                  "
                >
                  <span />
                </button>
              </td>
              <td>
                <span
                  class="official-model-status"
                  :class="{
                    'is-enabled':
                      tokenConfigured && isModelAvailable(row.model.status),
                    'is-unavailable': !isModelAvailable(row.model.status)
                  }"
                >
                  {{
                    !isModelAvailable(row.model.status)
                      ? t("unavailable")
                      : !tokenConfigured
                        ? t("tokenRequired")
                        : t("available")
                  }}
                </span>
              </td>
            </tr>
            <tr v-if="!modelRows.length">
              <td colspan="9" class="official-model-state">
                {{ t("noOfficialModelsAvailable") }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>

<style scoped>
.official-models-panel {
  display: grid;
  gap: 18px;
  width: 100%;
  padding-bottom: 36px;
  color: var(--text-primary);
}
.official-models-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}
.official-models-header h2 {
  margin: 6px 0 8px;
  font-size: 1.5rem;
}
.official-models-header p {
  max-width: 720px;
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.65;
}
.official-models-kicker {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--accent);
  font-size: 0.857143rem;
  font-weight: 650;
}
.official-models-header-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}
.official-shop-button,
.official-refresh-button,
.official-token-actions button,
.official-token-form-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid var(--theme-line);
  border-radius: 10px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.official-shop-button {
  border-color: color-mix(in srgb, var(--text-primary) 88%, transparent);
  background: var(--text-primary);
  color: var(--surface-main);
  text-decoration: none;
}
.official-shop-button:hover {
  opacity: 0.9;
}
.official-shop-button:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 3px var(--accent-soft);
}
button:disabled {
  cursor: wait;
  opacity: 0.58;
}
.official-token-card,
.official-quota-card,
.official-model-list-card {
  border: 1px solid var(--theme-line-soft);
  border-radius: 16px;
  background: var(--surface-raised);
  box-shadow: 0 1px 3px
    color-mix(in srgb, var(--theme-foreground) 4%, transparent);
}
.official-token-card {
  padding: 18px;
}
.official-token-card.is-configured {
  border-color: color-mix(in srgb, var(--accent) 30%, var(--theme-line-soft));
}
.official-token-status {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
}
.official-token-status > div {
  display: grid;
  gap: 4px;
}
.official-token-status small {
  color: var(--text-secondary);
  line-height: 1.5;
}
.official-token-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--accent-soft);
  color: var(--accent);
}
.official-token-badge,
.official-model-status {
  padding: 4px 9px;
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--text-tertiary);
  font-size: 0.785714rem;
  font-weight: 650;
  white-space: nowrap;
}
.official-token-card.is-configured .official-token-badge,
.official-model-status.is-enabled {
  background: var(--accent-soft);
  color: var(--accent);
}
.official-model-status.is-unavailable {
  background: color-mix(in srgb, var(--danger) 12%, var(--surface-muted));
  color: var(--danger);
}
.official-token-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 15px;
}
.official-token-actions .is-primary,
.official-token-form-actions .is-primary {
  border-color: color-mix(in srgb, var(--text-primary) 88%, transparent);
  background: var(--text-primary);
  color: var(--surface-main);
}
.official-token-actions .is-remove {
  color: var(--text-secondary);
}
.official-token-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--theme-line-soft);
}
.official-token-form label {
  display: grid;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 0.857143rem;
  font-weight: 620;
}
.official-token-form input {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--theme-line);
  border-radius: 10px;
  outline: 0;
  background: var(--surface-main);
  color: var(--text-primary);
  font: inherit;
}
.official-token-form input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.official-token-form-actions {
  display: flex;
  gap: 8px;
}
.official-quota-card {
  padding: 18px 20px;
}
.official-quota-heading {
  display: flex;
  justify-content: space-between;
  gap: 18px;
}
.official-quota-heading > div {
  display: grid;
  gap: 5px;
}
.official-quota-heading span,
.official-model-list-card > header span {
  color: var(--text-tertiary);
  font-size: 0.821429rem;
  font-weight: 600;
}
.official-quota-heading strong {
  font-size: 1.285714rem;
}
.official-quota-remaining {
  text-align: right;
}
.official-usage-summary {
  align-items: end;
}
.official-cost-track {
  height: 7px;
  margin-top: 15px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-muted);
}
.official-cost-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 0.2s ease;
}
.official-balance-details {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 18px;
  margin-top: 15px;
  padding-top: 13px;
  border-top: 1px solid var(--theme-line-soft);
  color: var(--text-secondary);
  font-size: 0.821429rem;
}
.official-model-list-card {
  overflow: hidden;
}
.official-model-list-card > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 17px 20px;
  border-bottom: 1px solid var(--theme-line-soft);
}
.official-model-list-card h3 {
  margin: 3px 0 0;
  font-size: 1.071429rem;
}
.official-model-table-wrap {
  overflow-x: auto;
}
.official-model-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}
.official-model-table th,
.official-model-table td {
  padding: 13px 16px;
  border-bottom: 1px solid var(--theme-line-soft);
  text-align: left;
  vertical-align: middle;
}
.official-model-table tr:last-child td {
  border-bottom: 0;
}
.official-model-table th {
  background: var(--surface-muted);
  color: var(--text-tertiary);
  font-size: 0.785714rem;
  font-weight: 650;
}
.official-model-table td {
  color: var(--text-secondary);
  font-size: 0.857143rem;
  font-variant-numeric: tabular-nums;
}
.official-model-table td:first-child {
  min-width: 240px;
}
.official-model-table td:first-child,
.official-model-table td:nth-child(5) {
  display: table-cell;
}
.official-model-table td strong,
.official-model-table td small {
  display: block;
}
.official-model-table td:first-child strong {
  color: var(--text-primary);
  font-size: 0.928571rem;
}
.official-model-table td small {
  margin-top: 4px;
  color: var(--text-tertiary);
  font-size: 0.75rem;
}
.official-model-price span {
  display: block;
  white-space: nowrap;
}
.official-model-toggle {
  position: relative;
  width: 38px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--theme-line);
  border-radius: 999px;
  background: var(--surface-muted);
  cursor: pointer;
  transition:
    background 0.16s ease,
    border-color 0.16s ease;
}
.official-model-toggle span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-tertiary);
  transition:
    transform 0.16s ease,
    background 0.16s ease;
}
.official-model-toggle[aria-checked="true"] {
  border-color: var(--accent);
  background: var(--accent);
}
.official-model-toggle[aria-checked="true"] span {
  background: var(--surface-main);
  transform: translateX(16px);
}
.official-model-toggle:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.official-model-state {
  padding: 28px;
  color: var(--text-tertiary);
  text-align: center;
}

@media (max-width: 900px) {
  .official-models-header {
    flex-direction: column;
  }
  .official-models-header-actions {
    align-self: flex-end;
  }
  .official-token-form {
    grid-template-columns: 1fr;
  }
  .official-token-form-actions {
    justify-content: flex-end;
  }
}
</style>
