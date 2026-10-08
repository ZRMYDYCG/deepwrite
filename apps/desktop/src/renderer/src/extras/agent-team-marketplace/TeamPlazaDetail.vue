<script setup lang="ts">
import { computed } from "vue";
import type {
  AgentTeamMarketplaceDetail,
  ShortAgentSubagentDefinition
} from "@deepwrite/contracts";
import { createScopedTranslator } from "../../i18n";
import TeamPlazaMemberList from "./TeamPlazaMemberList.vue";
import { workspaceTypeLabel } from "./teamPlazaLabels";

const t = createScopedTranslator("extras.agentTeamMarketplace");

const props = defineProps<{
  detail: AgentTeamMarketplaceDetail;
  installLabel: string;
  installDisabled: boolean;
}>();
const emit = defineEmits<{ close: []; install: []; like: [] }>();

/** Only teams visible in the plaza can be liked or installed. */
const listed = computed(
  () => props.detail.status === "published" && props.detail.enabled
);
const parents = computed(() =>
  (
    props.detail.team.teams as readonly {
      parentAgentId: string;
      subagents: ShortAgentSubagentDefinition[];
    }[]
  ).filter((parent) => parent.subagents.length > 0)
);
</script>

<template>
  <Teleport to="body">
    <div class="plaza-modal-backdrop" @mousedown.self="emit('close')">
      <section
        class="plaza-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="t('teamDetail')"
      >
        <header>
          <div>
            <span>
              {{ workspaceTypeLabel(detail.workspaceType) }} · v{{
                detail.version
              }}
              ·
              {{
                t("author", { name: detail.ownerName || detail.ownerUsername })
              }}
            </span>
            <h2>{{ detail.title }}</h2>
          </div>
          <button type="button" :aria-label="t('close')" @click="emit('close')">
            ×
          </button>
        </header>
        <div class="modal-scroll">
          <p class="plaza-muted overview">
            {{ detail.overview || t("noOverview") }}
          </p>
          <div class="member-tags summary-tags">
            <span class="badge accent">
              {{ t("memberCount", { count: detail.memberCount }) }}
            </span>
            <span class="badge">
              {{
                detail.team.parallelSubagents
                  ? t("parallelOn")
                  : t("parallelOff")
              }}
            </span>
          </div>
          <section v-for="parent in parents" :key="parent.parentAgentId">
            <h3 v-if="parents.length > 1">
              {{ t("parentAgent") }} · {{ parent.parentAgentId }}
            </h3>
            <TeamPlazaMemberList :members="parent.subagents" />
          </section>
        </div>
        <footer>
          <button
            v-if="listed"
            type="button"
            class="text-button"
            :aria-pressed="detail.likedByMe"
            :aria-label="t('like')"
            @click="emit('like')"
          >
            <span :class="{ liked: detail.likedByMe }">♥</span>
            {{ detail.likeCount }}
          </button>
          <button type="button" class="secondary-button" @click="emit('close')">
            {{ t("close") }}
          </button>
          <button
            v-if="listed"
            type="button"
            class="primary-button"
            :disabled="installDisabled"
            @click="emit('install')"
          >
            {{ installLabel }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped src="./team-plaza.css"></style>
<style scoped>
.overview {
  margin-bottom: 14px;
  white-space: pre-wrap;
}
.summary-tags {
  margin-bottom: 14px;
}
h3 {
  margin: 14px 0 8px;
  font-size: 14px;
}
</style>
