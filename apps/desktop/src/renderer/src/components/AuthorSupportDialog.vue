<script setup lang="ts">
import { createScopedTranslator } from "../i18n";
import { onMounted, ref } from "vue";
import wechatCode from "../assets/author-support/wechat.jpg";
import alipayCode from "../assets/author-support/alipay.jpg";

const t = createScopedTranslator("components.authorSupportDialog");

const emit = defineEmits<{ close: [] }>();
const closeButton = ref<HTMLButtonElement | null>(null);
const doneButton = ref<HTMLButtonElement | null>(null);

const paymentMethods = [
  {
    get name() {
      return t("weChatDonation");
    },
    get instruction() {
      return t("scanWithWeChat");
    },
    image: wechatCode
  },
  {
    get name() {
      return t("alipay");
    },
    get instruction() {
      return t("scanWithAlipay");
    },
    image: alipayCode
  }
];

function handleTab(event: KeyboardEvent): void {
  if (event.shiftKey && document.activeElement === closeButton.value) {
    event.preventDefault();
    doneButton.value?.focus();
  } else if (!event.shiftKey && document.activeElement === doneButton.value) {
    event.preventDefault();
    closeButton.value?.focus();
  }
}

onMounted(() => closeButton.value?.focus());
</script>

<template>
  <Teleport to="body">
    <div
      class="dialog-backdrop"
      @mousedown.self="emit('close')"
      @keydown.esc.stop="emit('close')"
      @keydown.tab="handleTab"
    >
      <section
        class="workspace-dialog author-support-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="author-support-title"
        aria-describedby="author-support-description"
      >
        <header>
          <div>
            <span class="dialog-eyebrow">DeepWrite</span>
            <h2 id="author-support-title">
              {{ t("supportTheAuthor") }}
            </h2>
          </div>
          <button
            ref="closeButton"
            class="dialog-close"
            type="button"
            :aria-label="t('closeSupportDialog')"
            @click="emit('close')"
          >
            ×
          </button>
        </header>

        <div class="dialog-content author-support-content">
          <div class="author-support-copy">
            <p id="author-support-description" class="dialog-description">
              {{
                t(
                  "donationsSupportDeepWriteSServersMaintenanceDevelopmentAndUsability"
                )
              }}
            </p>
            <p class="author-support-thanks">
              {{
                t("thankYouForSupportingDeepWriteDonationsAreOptionalChoose")
              }}
            </p>
          </div>

          <div class="author-support-methods">
            <figure v-for="method in paymentMethods" :key="method.name">
              <figcaption>
                <strong>{{ method.name }}</strong>
                <span>{{ method.instruction }}</span>
              </figcaption>
              <img
                :src="method.image"
                :alt="
                  t('valuePaymentCode', {
                    arg0: method.name
                  })
                "
              />
            </figure>
          </div>

          <div class="dialog-actions">
            <button
              ref="doneButton"
              class="dialog-primary-button"
              type="button"
              @click="emit('close')"
            >
              {{ t("close") }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.author-support-dialog {
  width: min(760px, calc(100vw - 60px));
}

.author-support-content {
  min-height: 0;
  overflow-y: auto;
}

.author-support-copy {
  margin-bottom: 20px;
}

.author-support-thanks {
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 0.857143rem;
  line-height: 1.7;
}

.author-support-methods {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 16px;
}

.author-support-methods figure {
  min-width: 0;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--theme-line);
  border-radius: 12px;
  background: var(--surface-raised);
}

.author-support-methods figcaption {
  display: grid;
  gap: 5px;
  margin-bottom: 12px;
  text-align: center;
}

.author-support-methods strong {
  color: var(--text-primary);
  font-size: 1rem;
}

.author-support-methods span {
  color: var(--text-secondary);
  font-size: 0.857143rem;
}

.author-support-methods img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  object-position: center bottom;
  border-radius: 8px;
}

@media (max-width: 600px) {
  .author-support-methods {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
