<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { onUnmounted, ref } from "vue";
import {
  MarketplaceLoginInputSchema,
  MarketplaceEmailLoginInputSchema,
  MarketplaceRegisterInputSchema,
  type MarketplaceSession
} from "@deepwrite/contracts/renderer";
import { uiMessage } from "../ui-feedback";
import { marketplaceAccountError } from "../utils/marketplaceAccountError";
import MarketplaceEmailFields from "./MarketplaceEmailFields.vue";

const t = createScopedTranslator("components.marketplaceAuthForm");
const emit = defineEmits<{ authenticated: [session: MarketplaceSession] }>();
const authMode = ref<"login" | "register">("login");
const loginMethod = ref<"username-password" | "email-password" | "email-code">(
  "username-password"
);
const pending = ref(false);
const sending = ref(false);
const username = ref("");
const password = ref("");
const displayName = ref("");
const email = ref("");
const emailCode = ref("");
const loginEmail = ref("");
const loginCode = ref("");
let alive = true;
onUnmounted(() => {
  alive = false;
});
async function submitAuth(): Promise<void> {
  const api = window.deepwrite;
  if (!api || pending.value || sending.value) return;
  const login = MarketplaceLoginInputSchema.safeParse(
    loginMethod.value === "email-password"
      ? { email: loginEmail.value, password: password.value }
      : { username: username.value, password: password.value }
  );
  const codeLogin = MarketplaceEmailLoginInputSchema.safeParse({
    email: loginEmail.value,
    emailCode: loginCode.value
  });
  const registration = MarketplaceRegisterInputSchema.safeParse({
    username: username.value.trim(),
    password: password.value,
    displayName: displayName.value.trim() || undefined,
    email: email.value,
    emailCode: emailCode.value
  });
  if (
    authMode.value === "register"
      ? !registration.success
      : loginMethod.value === "email-code"
        ? !codeLogin.success
        : !login.success
  ) {
    uiMessage.warning(
      authMode.value === "register"
        ? t("enterAUsernameAPasswordOfAtLeast8")
        : loginMethod.value === "email-code"
          ? t("enterAValidEmailAndCode")
          : t("enterAValidAccountAndPassword")
    );
    return;
  }
  pending.value = true;
  try {
    let session: MarketplaceSession;
    if (authMode.value === "register" && registration.success) {
      session = await api.marketplace.register(registration.data);
    } else if (loginMethod.value === "email-code" && codeLogin.success) {
      session = await api.marketplace.loginWithEmailCode(codeLogin.data);
    } else if (login.success) {
      session = await api.marketplace.login(login.data);
    } else {
      return;
    }
    if (!alive) return;
    password.value = "";
    emailCode.value = "";
    loginCode.value = "";
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
        <div
          v-if="authMode === 'login'"
          class="auth-methods"
          role="group"
          :aria-label="t('signInMethod')"
        >
          <button
            v-for="method in [
              'username-password',
              'email-password',
              'email-code'
            ] as const"
            :key="method"
            type="button"
            :aria-pressed="loginMethod === method"
            :class="{ active: loginMethod === method }"
            :disabled="pending || sending"
            @click="loginMethod = method"
          >
            {{
              method === "username-password"
                ? t("usernamePassword")
                : method === "email-password"
                  ? t("emailPassword")
                  : t("emailCodeLogin")
            }}
          </button>
        </div>
        <label
          v-if="authMode === 'register' || loginMethod === 'username-password'"
          ><span>{{ t("username") }}</span
          ><input
            v-model="username"
            autocomplete="username"
            maxlength="120"
            required
            :disabled="pending"
        /></label>
        <label v-if="authMode === 'login' && loginMethod === 'email-password'">
          <span>{{ t("email") }}</span>
          <input
            v-model="loginEmail"
            type="email"
            autocomplete="email"
            maxlength="320"
            required
            :disabled="pending"
          />
        </label>
        <label v-if="authMode === 'register' || loginMethod !== 'email-code'"
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
        <MarketplaceEmailFields
          v-if="authMode === 'login' && loginMethod === 'email-code'"
          v-model:email="loginEmail"
          v-model:code="loginCode"
          purpose="login"
          :disabled="pending"
          @sending="sending = $event"
        />
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
        <small>{{
          loginMethod === "email-code" && authMode === "login"
            ? t("emailCodeOnlyVerified")
            : t("existingUsersCanSignInDirectlyEmailLinkingIs")
        }}</small>
      </form>
    </div>
  </section>
</template>
<style scoped src="./marketplace-account.css"></style>
