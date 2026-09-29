<script setup lang="ts">
import { createScopedTranslator } from "../../i18n";
import { ref } from "vue";
import type {
  SyncConfig,
  SyncRequest,
  SyncResponse,
  SyncSpace
} from "@deepwrite/contracts/renderer";
import PopupSelect from "../../components/PopupSelect.vue";

const t = createScopedTranslator("extras.deviceSync");
const props = defineProps<{
  config: SyncConfig | null;
  pending: boolean;
  request(input: SyncRequest): Promise<SyncResponse | null>;
}>();
const emit = defineEmits<{ done: [] }>();
const nutstore = "https://dav.jianguoyun.com/dav/";
const form = ref<SyncConfig>(
  props.config
    ? { ...props.config }
    : {
        schemaVersion: 1,
        provider: "jianguoyun",
        endpoint: nutstore,
        username: "",
        directory: "DeepWriteSync",
        spaceId: null,
        get deviceName() {
          return t("myComputer");
        },
        excludedKeys: []
      }
);
const password = ref("");
const advanced = ref(false);
const spaces = ref<SyncSpace[] | null>(null);
async function connect() {
  const result = await props.request({
    operation: "connect",
    config: { ...form.value },
    password: password.value
  });
  if (result?.kind === "spaces") {
    password.value = "";
    spaces.value = result.spaces;
  }
}
async function join(spaceId: string | null) {
  const result = await props.request({ operation: "join", spaceId });
  if (result?.kind === "status") emit("done");
}
</script>

<template>
  <section class="sync-card sync-connection">
    <template v-if="spaces">
      <h2>{{ t("chooseSyncSpace") }}</h2>
      <p>{{ t("joinSpaceDescription") }}</p>
      <button
        v-for="space in spaces"
        :key="space.id"
        class="sync-button secondary"
        :disabled="pending"
        @click="join(space.id)"
      >
        {{ space.name }}
        <small>{{
          t("spaceSummary", {
            count: space.itemCount,
            date: (space.lastUpdatedAt ?? space.createdAt).slice(0, 10)
          })
        }}</small>
      </button>
      <button class="sync-button" :disabled="pending" @click="join(null)">
        {{ t("createWritingSpace") }}
      </button>
      <button class="sync-button quiet" @click="spaces = null">
        {{ t("backToConnection") }}
      </button>
    </template>
    <form v-else class="sync-form" @submit.prevent="connect">
      <h2>{{ t("connectCloudStorage") }}</h2>
      <p>{{ t("manualSyncDescription") }}</p>
      <label>{{ t("cloudProvider") }}</label
      ><PopupSelect
        :model-value="form.provider"
        :accessible-label="t('cloudProvider')"
        :options="[
          { value: 'jianguoyun', label: t('nutstore') },
          { value: 'webdav', label: t('otherWebdav') }
        ]"
        @update:model-value="
          (value) => {
            form.provider = value === 'jianguoyun' ? 'jianguoyun' : 'webdav';
            if (form.provider === 'jianguoyun') form.endpoint = nutstore;
          }
        "
      />
      <label v-if="form.provider === 'webdav'"
        >{{ t("serverAddress")
        }}<input
          v-model="form.endpoint"
          :aria-label="t('webdavAddress')"
          autocomplete="url"
          placeholder="https://example.test/dav/"
      /></label>
      <label
        >{{ t("account")
        }}<input
          v-model="form.username"
          :aria-label="t('storageAccount')"
          autocomplete="username"
      /></label>
      <label
        >{{ t("appPassword")
        }}<input
          v-model="password"
          :aria-label="t('storageAppPassword')"
          type="password"
          autocomplete="off"
          :placeholder="
            config ? t('keepSavedPassword') : t('enterAppPassword')
          "
      /></label>
      <a
        v-if="form.provider === 'jianguoyun'"
        href="https://help.jianguoyun.com/?p=2064"
        target="_blank"
        rel="noreferrer"
        >{{ t("getNutstorePassword") }}</a
      >
      <button
        type="button"
        class="sync-button quiet"
        :aria-expanded="advanced"
        @click="advanced = !advanced"
      >
        {{ t("advancedSettings") }}
      </button>
      <template v-if="advanced"
        ><label
          >{{ t("syncDirectory")
          }}<input
            v-model="form.directory"
            :aria-label="t('syncDirectory')" /></label
        ><label
          >{{ t("deviceName")
          }}<input
            v-model="form.deviceName"
            :aria-label="t('deviceName')" /></label
      ></template>
      <button class="sync-button" type="submit" :disabled="pending">
        {{ pending ? t("verifyingConnection") : t("connectContinue") }}
      </button>
    </form>
  </section>
</template>
