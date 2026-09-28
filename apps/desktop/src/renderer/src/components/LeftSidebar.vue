<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import type {
  BookResourceDialogMode,
  CatalogResourceNodeActionPayload,
  CatalogLibraryEntryDragPayload,
  DialogMode,
  LongBookResourceNodeActionPayload,
  LongTreeItemAction,
  ResourceSectionActionPayload,
  ResourceTreeNode,
  ResourceTreeSection
} from "../types/workspace";
import { moreFeatures } from "./sidebarMoreFeatures";
import AppIcon from "./AppIcon.vue";
import SidebarResourceList from "./SidebarResourceList.vue";
import SidebarProfileMenu from "./SidebarProfileMenu.vue";
import { createTransientScrollbarController } from "../utils/transientScrollbar";

const props = defineProps<{
  sections: ResourceTreeSection[];
  selectedId: string;
  imitationRunning?: boolean;
  longBookAnalysisRunning?: boolean;
  shortBookAnalysisRunning?: boolean;
  revisionAnalysisRunning?: boolean;
  libraryEntryClipboardDomain?: "skill" | "material" | undefined;
  activePrimaryFeature:
    | PrimaryFeatureId
    | "chat-assistant"
    | "skill-marketplace"
    | "cloud-backup"
    | "device-sync"
    | "zhuque-detection"
    | undefined;
  marketplaceDisplayName?: string | undefined;
  longTreeActionsDisabled?: boolean;
}>();

const emit = defineEmits<{
  collapse: [];
  createBook: [];
  openDialog: [mode: DialogMode];
  openChatAssistant: [];
  openAgentTeams: [];
  openMarketplace: [];
  openCloudBackup: [];
  openDeviceSync: [];
  openZhuqueDetection: [];
  openSettings: [];
  selectResource: [node: ResourceTreeNode];
  bookAction: [mode: BookResourceDialogMode, node: ResourceTreeNode];
  exportBook: [node: ResourceTreeNode];
  longBookAction: [payload: LongBookResourceNodeActionPayload];
  resourceAction: [payload: ResourceSectionActionPayload];
  resourceNodeAction: [payload: CatalogResourceNodeActionPayload];
  moveLibraryEntry: [payload: CatalogLibraryEntryDragPayload];
  createExpertSection: [node: ResourceTreeNode];
  createLongDraftSection: [node: ResourceTreeNode];
  longDraftSectionAction: [
    action: "move-up" | "move-down" | "delete",
    node: ResourceTreeNode
  ];
  createLongTreeItem: [node: ResourceTreeNode];
  longTreeItemAction: [action: LongTreeItemAction, node: ResourceTreeNode];
  deleteLongLedgerCommit: [node: ResourceTreeNode];
  removeExpertSection: [node: ResourceTreeNode];
  expertSectionAction: [
    action: "move-up" | "move-down",
    node: ResourceTreeNode
  ];
  createCharacterItem: [node: ResourceTreeNode];
  characterItemAction: [
    action: "rename" | "move-up" | "move-down" | "delete",
    node: ResourceTreeNode
  ];
}>();

const sidebarScrollbar = createTransientScrollbarController();
function handleSidebarScroll(event: Event): void {
  const element = event.currentTarget;
  if (element instanceof HTMLElement) sidebarScrollbar.reveal(element);
}
onBeforeUnmount(() => sidebarScrollbar.dispose());
function openSettings(): void {
  emit("openSettings");
}

const newBookItem = {
  id: "create-book",
  label: "新建书籍",
  icon: "plus",
  shortcut: "Ctrl N"
} as const;

type PrimaryFeatureId = DialogMode | "agent-teams";

const navItems: Array<{
  id: PrimaryFeatureId;
  label: string;
  icon: "directory" | "model" | "wand" | "message" | "brain";
}> = [{ id: "agent-teams", label: "智能体团队", icon: "brain" }];

const moreExpanded = ref(false);

function activateMoreFeature(
  id:
    | "chat-assistant"
    | "imitation"
    | "long-book-analysis"
    | "revision-analysis"
    | "short-book-analysis"
    | "style-comparison"
    | "skill-marketplace"
    | "cloud-backup"
    | "device-sync"
    | "zhuque-detection"
    | "runtime"
): void {
  if (id === "chat-assistant") {
    emit("openChatAssistant");
    return;
  }
  if (id === "revision-analysis") {
    emit("openDialog", "revision-analysis");
    return;
  }
  if (id === "style-comparison") {
    emit("openDialog", "style-comparison");
    return;
  }
  if (id === "imitation") {
    emit("openDialog", "imitation");
    return;
  }
  if (id === "short-book-analysis") {
    emit("openDialog", "short-book-analysis");
    return;
  }
  if (id === "long-book-analysis") {
    emit("openDialog", "long-book-analysis");
    return;
  }
  if (id === "skill-marketplace") {
    emit("openMarketplace");
    return;
  }
  if (id === "device-sync") {
    emit("openDeviceSync");
    return;
  }
  if (id === "cloud-backup") {
    emit("openCloudBackup");
    return;
  }
  if (id === "zhuque-detection") {
    emit("openZhuqueDetection");
    return;
  }
  openSettings();
}

function activateNav(id: "create-book" | PrimaryFeatureId): void {
  if (id === "create-book") {
    emit("createBook");
    return;
  }
  if (id === "agent-teams") {
    emit("openAgentTeams");
    return;
  }
  emit("openDialog", id);
}
</script>

<template>
  <aside class="left-sidebar" aria-label="DeepWrite 导航与资源树">
    <header class="sidebar-brand-row">
      <button
        class="brand-button"
        type="button"
        aria-label="DeepWrite 工作区菜单"
      >
        <span class="brand-mark"><AppIcon name="logo" :size="19" /></span>
        <span class="brand-name">DeepWrite</span>
      </button>
      <button
        class="icon-button"
        type="button"
        aria-label="收起左侧栏"
        @click="emit('collapse')"
      >
        <AppIcon name="panel-left" :size="18" />
      </button>
    </header>

    <nav class="primary-nav new-book-nav" aria-label="新建书籍">
      <button
        class="nav-row"
        type="button"
        :data-nav-id="newBookItem.id"
        @click="activateNav(newBookItem.id)"
      >
        <AppIcon :name="newBookItem.icon" :size="17" />
        <span>{{ newBookItem.label }}</span>
        <kbd>{{ newBookItem.shortcut }}</kbd>
      </button>
    </nav>

    <div
      class="sidebar-scroll transient-scrollbar"
      @scroll.passive="handleSidebarScroll"
    >
      <nav class="primary-nav scrollable-primary-nav" aria-label="主要功能">
        <button
          v-for="item in navItems"
          :key="item.id"
          class="nav-row"
          :class="{ 'is-active': item.id === props.activePrimaryFeature }"
          type="button"
          :data-nav-id="item.id"
          :aria-current="
            item.id === props.activePrimaryFeature ? 'page' : undefined
          "
          @click="activateNav(item.id)"
        >
          <AppIcon :name="item.icon" :size="17" />
          <span>{{ item.label }}</span>
        </button>

        <button
          class="nav-row more-toggle"
          :class="{ 'is-expanded': moreExpanded }"
          type="button"
          data-nav-id="more"
          :aria-expanded="moreExpanded"
          aria-controls="more-feature-list"
          @click="moreExpanded = !moreExpanded"
        >
          <AppIcon name="more" :size="17" />
          <span>更多功能</span>
          <AppIcon class="more-toggle-chevron" name="chevron" :size="13" />
        </button>

        <div
          v-if="moreExpanded"
          id="more-feature-list"
          class="more-feature-list"
        >
          <button
            v-for="feature in moreFeatures"
            :key="feature.id"
            class="more-feature-row"
            :class="{ 'is-active': feature.id === props.activePrimaryFeature }"
            type="button"
            :data-feature-id="feature.id"
            :title="feature.description"
            :aria-current="
              feature.id === props.activePrimaryFeature ? 'page' : undefined
            "
            @click="activateMoreFeature(feature.id)"
          >
            <span class="more-feature-icon"
              ><AppIcon :name="feature.icon" :size="15"
            /></span>
            <span class="more-feature-copy">
              <strong>{{ feature.label }}</strong>
              <small>{{ feature.description }}</small>
            </span>
            <span
              v-if="
                (feature.id === 'revision-analysis' &&
                  props.revisionAnalysisRunning) ||
                (feature.id === 'short-book-analysis' &&
                  props.shortBookAnalysisRunning) ||
                (feature.id === 'imitation' && props.imitationRunning) ||
                (feature.id === 'long-book-analysis' &&
                  props.longBookAnalysisRunning)
              "
              class="nav-background-status"
              :title="
                feature.id === 'imitation'
                  ? '学习仿写正在后台运行'
                  : feature.id === 'revision-analysis'
                    ? '修改分析正在后台运行'
                    : feature.id === 'short-book-analysis'
                      ? '短篇拆书正在后台运行'
                      : '长篇拆书正在后台运行'
              "
            >
              <i aria-hidden="true" />后台中
            </span>
          </button>
        </div>
      </nav>

      <SidebarResourceList
        :sections="sections"
        :selected-id="selectedId"
        :long-tree-actions-disabled="longTreeActionsDisabled"
        :library-entry-clipboard-domain="libraryEntryClipboardDomain"
        @select-resource="emit('selectResource', $event)"
        @book-action="(mode, book) => emit('bookAction', mode, book)"
        @export-book="emit('exportBook', $event)"
        @long-book-action="emit('longBookAction', $event)"
        @resource-action="emit('resourceAction', $event)"
        @resource-node-action="emit('resourceNodeAction', $event)"
        @move-library-entry="emit('moveLibraryEntry', $event)"
        @create-expert-section="emit('createExpertSection', $event)"
        @create-long-draft-section="emit('createLongDraftSection', $event)"
        @long-draft-section-action="
          (action, sectionNode) =>
            emit('longDraftSectionAction', action, sectionNode)
        "
        @create-long-tree-item="emit('createLongTreeItem', $event)"
        @long-tree-item-action="
          (action, itemNode) => emit('longTreeItemAction', action, itemNode)
        "
        @delete-long-ledger-commit="emit('deleteLongLedgerCommit', $event)"
        @remove-expert-section="emit('removeExpertSection', $event)"
        @expert-section-action="
          (action, sectionNode) =>
            emit('expertSectionAction', action, sectionNode)
        "
        @create-character-item="emit('createCharacterItem', $event)"
        @character-item-action="
          (action, itemNode) => emit('characterItemAction', action, itemNode)
        "
      />
    </div>

    <SidebarProfileMenu
      :marketplace-display-name="marketplaceDisplayName"
      @open-settings="emit('openSettings')"
    />
  </aside>
</template>
