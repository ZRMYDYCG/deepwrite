<script setup lang="ts">
import type { AgentTeamMarketplaceSummary } from "@deepwrite/contracts";
import AgentTeamSwitch from "../../components/AgentTeamSwitch.vue";
import { createScopedTranslator } from "../../i18n";
import TeamPlazaPagination from "./TeamPlazaPagination.vue";
import { statusLabel, workspaceTypeLabel } from "./teamPlazaLabels";
import { TEAM_PLAZA_PAGE_SIZE, type TeamPlazaController } from "./useTeamPlaza";

const t = createScopedTranslator("extras.agentTeamMarketplace");

defineProps<{ plaza: TeamPlazaController }>();
const emit = defineEmits<{
  edit: [item: AgentTeamMarketplaceSummary];
  publish: [];
}>();

function metaText(item: AgentTeamMarketplaceSummary): string {
  if (item.status === "deleted") {
    return item.purgeAt
      ? t("retainedUntil", { date: new Date(item.purgeAt).toLocaleString() })
      : t("deleted");
  }
  return t("mineMeta", {
    version: item.version,
    visibility: item.enabled ? t("visible") : t("hidden"),
    updatedAt: new Date(item.updatedAt).toLocaleString()
  });
}
</script>

<template>
  <section class="plaza-mine">
    <div class="plaza-heading">
      <div>
        <h2>{{ t("mineTitle") }}</h2>
        <p>{{ t("mineDescription") }}</p>
      </div>
      <button
        class="secondary-button"
        type="button"
        :disabled="plaza.mine.loading"
        @click="plaza.loadMine()"
      >
        {{ plaza.mine.loading ? t("refreshing") : t("refresh") }}
      </button>
    </div>

    <div
      v-if="plaza.mine.loading && plaza.mine.items.length === 0"
      class="plaza-empty"
    >
      <span>{{ t("loadingMine") }}</span>
    </div>
    <div v-else-if="plaza.mine.items.length === 0" class="plaza-empty">
      <strong>{{ t("noPublications") }}</strong>
      <button
        type="button"
        class="primary-button compact"
        @click="emit('publish')"
      >
        {{ t("publishFirstTeam") }}
      </button>
    </div>
    <ul v-else class="mine-list">
      <li v-for="item in plaza.mine.items" :key="item.id" class="mine-row">
        <button
          class="mine-main"
          type="button"
          :disabled="item.status === 'deleted'"
          @click="plaza.openDetail(item, true)"
        >
          <span class="badge accent">{{
            workspaceTypeLabel(item.workspaceType)
          }}</span>
          <span>
            <strong>{{ item.title }}</strong>
            <small>{{ metaText(item) }}</small>
          </span>
        </button>
        <span class="badge" :data-status="item.status">
          {{ statusLabel(item.status) }}
        </span>
        <div v-if="item.status !== 'deleted'" class="mine-actions">
          <label class="visibility-switch">
            <AgentTeamSwitch
              :model-value="item.enabled"
              :label="t('showInPlaza')"
              @update:model-value="plaza.setEnabled(item, $event)"
            />
            <span>{{ t("showInPlaza") }}</span>
          </label>
          <button
            class="secondary-button compact"
            type="button"
            @click="emit('edit', item)"
          >
            {{ t("edit") }}
          </button>
          <button
            class="danger-outline-button compact"
            type="button"
            @click="plaza.deleteTarget.value = item"
          >
            {{ t("delete") }}
          </button>
        </div>
      </li>
    </ul>
    <TeamPlazaPagination
      :page="plaza.mine.page"
      :total-pages="plaza.mine.totalPages"
      :total="plaza.mine.total"
      :page-size="TEAM_PLAZA_PAGE_SIZE"
      :loading="plaza.mine.loading"
      @change="plaza.loadMine"
    />
  </section>
</template>

<style scoped src="./team-plaza.css"></style>
<style scoped>
.mine-list {
  display: grid;
  gap: 8px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}
.mine-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 9px;
  padding: 11px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 10px;
  background: var(--surface-main);
}
.mine-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  border: 0;
  color: var(--text-primary);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.mine-main > span:last-child {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.mine-main small {
  overflow: hidden;
  color: var(--text-tertiary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mine-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
}
.visibility-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  cursor: pointer;
}
@media (max-width: 820px) {
  .mine-row {
    grid-template-columns: 1fr auto;
  }
  .mine-actions {
    grid-column: 1 / -1;
    flex-wrap: wrap;
  }
}
</style>
