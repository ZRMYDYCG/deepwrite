<script setup lang="ts">
import { AGENT_TEAM_MARKETPLACE_OVERVIEW_MAX_LENGTH } from "@deepwrite/contracts/renderer";
import PopupSelect from "../../components/PopupSelect.vue";
import { createScopedTranslator } from "../../i18n";
import TeamPlazaMemberList from "./TeamPlazaMemberList.vue";
import type { TeamPlazaPublishController } from "./useTeamPlazaPublish";

const t = createScopedTranslator("extras.agentTeamMarketplace");

const props = defineProps<{
  form: TeamPlazaPublishController;
  catalogLoaded: boolean;
}>();

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}
</script>

<template>
  <section class="plaza-publish">
    <div class="plaza-heading">
      <div>
        <h2>
          {{
            form.editing.value
              ? t("editTitle", { title: form.editing.value.title })
              : t("publishTitle")
          }}
        </h2>
        <p>{{ t("publishDescription") }}</p>
      </div>
      <button
        v-if="form.editing.value"
        class="secondary-button"
        type="button"
        @click="form.reset()"
      >
        {{ t("cancelEdit") }}
      </button>
    </div>

    <form class="publish-form" @submit.prevent="form.submit()">
      <label>
        <span>{{ t("localTeam") }}</span>
        <PopupSelect
          :model-value="form.teamId.value"
          :options="form.teamOptions.value"
          :accessible-label="t('localTeam')"
          :placeholder="
            catalogLoaded ? t('selectLocalTeam') : t('loadingLocalTeams')
          "
          :disabled="!catalogLoaded"
          @update:model-value="form.selectTeam(String($event))"
        />
      </label>
      <label>
        <span>{{ t("teamTitle") }}</span>
        <input
          :value="form.title.value"
          maxlength="80"
          @input="props.form.title.value = inputValue($event)"
        />
      </label>
      <label class="full-field">
        <span>{{ t("teamOverview") }}</span>
        <textarea
          :value="form.overview.value"
          rows="4"
          :maxlength="AGENT_TEAM_MARKETPLACE_OVERVIEW_MAX_LENGTH"
          :placeholder="t('overviewPlaceholder')"
          @input="props.form.overview.value = inputValue($event)"
        />
      </label>

      <div class="full-field members-field">
        <span class="field-label">{{ t("membersPreview") }}</span>
        <p v-if="form.customModelCount.value > 0" class="stable-help">
          {{ t("customModelNotice", { count: form.customModelCount.value }) }}
        </p>
        <TeamPlazaMemberList
          v-if="form.members.value.length > 0"
          :members="form.members.value"
        />
        <p v-else class="stable-help">{{ t("noMembersSelected") }}</p>
      </div>

      <div class="full-field publish-actions">
        <button
          class="primary-button"
          type="submit"
          :disabled="form.pending.value"
        >
          {{
            form.pending.value
              ? t("submitting")
              : form.editing.value
                ? t("submitUpdate")
                : t("submitPublish")
          }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped src="./team-plaza.css"></style>
<style scoped>
.publish-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}
.full-field {
  grid-column: 1 / -1;
}
.members-field {
  display: grid;
  gap: 9px;
}
.field-label {
  color: var(--text-secondary);
  font-size: 12px;
}
.publish-actions {
  display: flex;
  justify-content: flex-end;
}
@media (max-width: 820px) {
  .publish-form {
    grid-template-columns: 1fr;
  }
}
</style>
