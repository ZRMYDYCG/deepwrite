<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { onUnmounted, ref } from "vue";
import {
  MarketplaceLoginInputSchema,
  MarketplaceRegisterInputSchema,
  type MarketplaceSession
} from "@deepwrite/contracts/renderer";
import { uiMessage } from "../ui-feedback";
import { marketplaceAccountError } from "../utils/marketplaceAccountError";
import MarketplaceEmailFields from "./MarketplaceEmailFields.vue";

const t = createScopedTranslator("components.marketplaceAuthForm");
const emit = defineEmits<{ authenticated: [session: MarketplaceSession] }>();
const authMode = ref<"login" | "register">("login");
const pending = ref(false);
const sending = ref(false);
const username = ref("");
const password = ref("");
const displayName = ref("");
const email = ref("");
const emailCode = ref("");
let alive = true;
onUnmounted(() => {
  alive = false;
});
async function submitAuth(): Promise<void> {
  const api = window.deepwrite;
  if (!api || pending.value || sending.value) return;
  const credentials = {
    username: username.value.trim(),
    password: password.value
  };
  const login = MarketplaceLoginInputSchema.safeParse(credentials);
  const registration = MarketplaceRegisterInputSchema.safeParse({
    ...credentials,
    displayName: displayName.value.trim() || undefined,
    email: email.value,
    emailCode: emailCode.value
  });
  if (authMode.value === "login" ? !login.success : !registration.success) {
    uiMessage.warning(
      authMode.value === "login"
        ? t("enterAValidUsernameAndPassword")
        : t("enterAUsernameAPasswordOfAtLeast8")
    );
    return;
  }
  pending.value = true;
  try {
    const session =
      authMode.value === "login" && login.success
        ? await api.marketplace.login(login.data)
        : registration.success
          ? await api.marketplace.register(registration.data)
          : null;
    if (!alive || !session) return;
    password.value = "";
    emailCode.value = "";
    uiMessage.success(
      authMode.value === "login" ? t("signedIn") : t("registeredAndSignedIn")
    );
    emit("authenticated", session);
  } catch (error: unknown) {
    if (alive)
      uiMessage.error(
        marketplaceAccountError(
          error,
          t("couldNotSignInOrRegisterTryAgainLater")
        )
      );
  } finally {
    if (alive) pending.value = false;
  }
}
</script>
<template>
  <section class="auth-shell">
    <div class="auth-card">
      <div class="auth-tabs" role="tablist" :aria-label="t('signInOrRegister')">
        <button
          v-for="mode in ['login', 'register'] as const"
          :key="mode"
          type="button"
          role="tab"
          :aria-selected="authMode === mode"
          :class="{ active: authMode === mode }"
          :disabled="pending || sending"
          @click="authMode = mode"
        >
          {{ mode === "login" ? t("signIn") : t("register") }}
        </button>
      </div>
      <form class="auth-form" @submit.prevent="submitAuth">
        <label
          ><span>{{ t("username") }}</span
          ><input
            v-model="username"
            autocomplete="username"
            maxlength="120"
            required
            :disabled="pending"
        /></label>
        <label
          ><span>{{ t("password") }}</span
          ><input
            v-model="password"
            type="password"
            :autocomplete="
              authMode === 'login' ? 'current-password' : 'new-password'
            "
            maxlength="128"
            required
            :disabled="pending"
        /></label>
        <template v-if="authMode === 'register'">
          <label
            ><span>{{ t("displayNameOptional") }}</span
            ><input
              v-model="displayName"
              autocomplete="nickname"
              maxlength="120"
              :disabled="pending"
          /></label>
          <MarketplaceEmailFields
            v-model:email="email"
            v-model:code="emailCode"
            purpose="register"
            :disabled="pending"
            @sending="sending = $event"
          />
        </template>
        <button
          class="primary-button"
          type="submit"
          :disabled="pending || sending"
        >
          {{
            pending
              ? t("pleaseWait")
              : authMode === "login"
                ? t("signIn")
                : t("registerAndSignIn")
          }}
        </button>
        <small>{{ t("existingUsersCanSignInDirectlyEmailLinkingIs") }}</small>
      </form>
    </div>
  </section>
</template>
<style scoped src="./marketplace-account.css"></style>
