<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { onUnmounted, ref } from "vue";
import {
  MarketplaceBindEmailInputSchema,
  type MarketplaceSession
} from "@deepwrite/contracts/renderer";
import { uiMessage } from "../ui-feedback";
import { marketplaceAccountError } from "../utils/marketplaceAccountError";
import MarketplaceEmailFields from "./MarketplaceEmailFields.vue";

const t = createScopedTranslator("components.marketplaceBindEmail");
const props = defineProps<{ session: MarketplaceSession }>();
const emit = defineEmits<{ updated: [session: MarketplaceSession] }>();
const open = ref(false);
const email = ref(props.session.user?.email ?? "");
const emailCode = ref("");
const pending = ref(false);
const sending = ref(false);
let alive = true;
onUnmounted(() => {
  alive = false;
});
async function bind(): Promise<void> {
  const api = window.deepwrite?.marketplace;
  if (!api || pending.value || sending.value) return;
  const parsed = MarketplaceBindEmailInputSchema.safeParse({
    email: email.value,
    emailCode: emailCode.value
  });
  if (!parsed.success) {
    uiMessage.warning(t("enterAValidEmailAndSixDigitVerificationCode"));
    return;
  }
  pending.value = true;
  try {
    const session = await api.bindEmail(parsed.data);
    if (!alive) return;
    emailCode.value = "";
    open.value = false;
    emit("updated", session);
    uiMessage.success(t("emailVerifiedAndLinked"));
  } catch (error: unknown) {
    if (alive)
      uiMessage.error(
        marketplaceAccountError(error, t("couldNotLinkEmailTryAgainLater"))
      );
  } finally {
    if (alive) pending.value = false;
  }
}
</script>
<template>
  <span v-if="session.user?.emailVerifiedAt" class="verified">{{
    t("emailVerified")
  }}</span>
  <div v-else class="bind-entry">
    <button
      type="button"
      :aria-expanded="open"
      :disabled="pending || sending"
      @click="open = !open"
    >
      {{ open ? t("skipForNow") : t("linkEmailOptional") }}
    </button>
    <form
      v-if="open"
      class="bind-form"
      :aria-label="t('linkEmail')"
      @submit.prevent="bind"
    >
      <p>
        {{ t("existingUsersMayLinkAnEmailVoluntarilyTheApp") }}
      </p>
      <MarketplaceEmailFields
        v-model:email="email"
        v-model:code="emailCode"
        purpose="account"
        :disabled="pending"
        @sending="sending = $event"
      />
      <button
        class="primary-button"
        type="submit"
        :disabled="pending || sending"
      >
        {{ pending ? t("verifying") : t("verifyAndLink") }}
      </button>
    </form>
  </div>
</template>
<style scoped src="./marketplace-account.css"></style>
