import { computed, reactive, ref, shallowRef } from "vue";
import type {
  AgentTeamCatalogSnapshot,
  AgentTeamMarketplaceDetail,
  AgentTeamMarketplaceListFilter,
  AgentTeamMarketplaceSort,
  AgentTeamMarketplaceSummary,
  AgentTeamWorkspaceType,
  DeepWriteApi,
  MarketplaceSession
} from "@deepwrite/contracts";
import { createScopedTranslator } from "../../i18n";
import { uiMessage } from "../../ui-feedback";
import { marketplaceAccountError } from "../../utils/marketplaceAccountError";

const t = createScopedTranslator("extras.agentTeamMarketplace");

export const TEAM_PLAZA_PAGE_SIZE = 24;
export type TeamPlazaTab = "browse" | "mine" | "publish";
export type TeamPlazaApi = Pick<
  DeepWriteApi,
  "marketplace" | "agentTeamMarketplace"
>;

export interface TeamPlazaList {
  items: AgentTeamMarketplaceSummary[];
  page: number;
  total: number;
  totalPages: number;
  loading: boolean;
}

export interface TeamPlazaOptions {
  api(): TeamPlazaApi | undefined;
  catalog(): AgentTeamCatalogSnapshot | null;
  initialSession: MarketplaceSession | null;
  onSessionChange(session: MarketplaceSession): void;
  onCatalogChange(catalog: AgentTeamCatalogSnapshot): void;
}

function emptyList(): TeamPlazaList {
  return { items: [], page: 1, total: 0, totalPages: 0, loading: false };
}

export function useTeamPlaza(options: TeamPlazaOptions) {
  const session = ref<MarketplaceSession | null>(options.initialSession);
  const tab = ref<TeamPlazaTab>("browse");
  const browse = reactive(emptyList());
  const mine = reactive(emptyList());
  const filters = reactive({
    query: "",
    workspaceType: "" as AgentTeamWorkspaceType | "",
    sort: "latest" as AgentTeamMarketplaceSort
  });
  const detail = shallowRef<AgentTeamMarketplaceDetail | null>(null);
  const detailLoadingId = ref("");
  const installing = reactive(new Set<string>());
  const deleteTarget = shallowRef<AgentTeamMarketplaceSummary | null>(null);
  const deletePending = ref(false);
  const enabledRequests = new Map<string, number>();
  let enabledSequence = 0;

  const authenticated = computed(() => session.value?.authenticated === true);
  /** Highest locally installed plaza version per remote team id. */
  const installedVersions = computed(() => {
    const versions = new Map<string, number>();
    for (const team of options.catalog()?.teams ?? []) {
      const source = team.marketplaceSource;
      if (source && (versions.get(source.teamId) ?? 0) < source.version) {
        versions.set(source.teamId, source.version);
      }
    }
    return versions;
  });

  function updateSession(next: MarketplaceSession): void {
    session.value = next;
    options.onSessionChange(next);
  }

  async function failed(error: unknown, fallback: string): Promise<void> {
    uiMessage.error(marketplaceAccountError(error, fallback));
    const api = options.api();
    if (!api) return;
    try {
      updateSession(await api.marketplace.session());
    } catch {
      // Keep the current view when the session itself is unreachable.
    }
  }

  async function loadList(
    target: TeamPlazaList,
    request: (filter: AgentTeamMarketplaceListFilter) => Promise<{
      items: AgentTeamMarketplaceSummary[];
      page: number;
      total: number;
      totalPages: number;
    }>,
    filter: AgentTeamMarketplaceListFilter,
    fallback: string
  ): Promise<void> {
    target.loading = true;
    try {
      const result = await request({
        ...filter,
        pageSize: TEAM_PLAZA_PAGE_SIZE
      });
      Object.assign(target, {
        items: result.items,
        page: result.page,
        total: result.total,
        totalPages: result.totalPages
      });
    } catch (error: unknown) {
      await failed(error, fallback);
    } finally {
      target.loading = false;
    }
  }

  function setFilter<Key extends keyof typeof filters>(
    key: Key,
    value: (typeof filters)[Key]
  ): void {
    filters[key] = value;
  }

  async function loadBrowse(page = browse.page): Promise<void> {
    const api = options.api();
    if (!api || !authenticated.value) return;
    await loadList(
      browse,
      (filter) => api.agentTeamMarketplace.list(filter),
      {
        ...(filters.query.trim() ? { query: filters.query.trim() } : {}),
        ...(filters.workspaceType
          ? { workspaceType: filters.workspaceType }
          : {}),
        sort: filters.sort,
        page
      },
      t("loadFailed")
    );
  }

  async function loadMine(page = mine.page): Promise<void> {
    const api = options.api();
    if (!api || !authenticated.value) return;
    await loadList(
      mine,
      (filter) => api.agentTeamMarketplace.listMine(filter),
      { page },
      t("loadMineFailed")
    );
  }

  async function restoreSession(): Promise<void> {
    const api = options.api();
    if (!api) return;
    try {
      updateSession(await api.marketplace.session());
      await Promise.all([loadBrowse(1), loadMine(1)]);
    } catch (error: unknown) {
      uiMessage.error(marketplaceAccountError(error, t("restoreFailed")));
    }
  }

  async function signedIn(next: MarketplaceSession): Promise<void> {
    updateSession(next);
    await Promise.all([loadBrowse(1), loadMine(1)]);
  }

  async function logout(): Promise<void> {
    const api = options.api();
    if (!api) return;
    try {
      updateSession(await api.marketplace.logout());
      Object.assign(browse, emptyList());
      Object.assign(mine, emptyList());
      detail.value = null;
      uiMessage.success(t("signedOut"));
    } catch (error: unknown) {
      uiMessage.error(marketplaceAccountError(error, t("signOutFailed")));
    }
  }

  async function selectTab(next: TeamPlazaTab): Promise<void> {
    tab.value = next;
    if (next === "browse" && browse.items.length === 0) await loadBrowse();
    if (next === "mine" && mine.items.length === 0) await loadMine();
  }

  async function openDetail(
    item: AgentTeamMarketplaceSummary,
    owned = false
  ): Promise<void> {
    const api = options.api();
    if (!api || detailLoadingId.value) return;
    detailLoadingId.value = item.id;
    try {
      detail.value = owned
        ? await api.agentTeamMarketplace.myDetail({ id: item.id })
        : await api.agentTeamMarketplace.detail({ id: item.id });
    } catch (error: unknown) {
      await failed(error, t("detailFailed"));
    } finally {
      detailLoadingId.value = "";
    }
  }

  function patchSummaries(
    id: string,
    patch: Partial<AgentTeamMarketplaceSummary>
  ): void {
    for (const item of [...browse.items, ...mine.items]) {
      if (item.id === id) Object.assign(item, patch);
    }
    if (detail.value?.id === id) detail.value = { ...detail.value, ...patch };
  }

  async function toggleLike(item: AgentTeamMarketplaceSummary): Promise<void> {
    const api = options.api();
    if (!api) return;
    const previous = { likedByMe: item.likedByMe, likeCount: item.likeCount };
    const liked = !previous.likedByMe;
    patchSummaries(item.id, {
      likedByMe: liked,
      likeCount: Math.max(0, previous.likeCount + (liked ? 1 : -1))
    });
    try {
      const result = await api.agentTeamMarketplace.like({
        id: item.id,
        liked
      });
      patchSummaries(item.id, {
        likedByMe: result.liked,
        likeCount: result.likeCount
      });
    } catch (error: unknown) {
      patchSummaries(item.id, previous);
      await failed(error, t("likeFailed"));
    }
  }

  /** Optimistic switch; the newest request wins and failures restore. */
  async function setEnabled(
    item: AgentTeamMarketplaceSummary,
    enabled: boolean
  ): Promise<void> {
    const api = options.api();
    if (!api || item.status === "deleted") return;
    const previous = item.enabled;
    const sequence = ++enabledSequence;
    enabledRequests.set(item.id, sequence);
    patchSummaries(item.id, { enabled });
    try {
      const updated = await api.agentTeamMarketplace.setEnabled({
        id: item.id,
        enabled
      });
      if (enabledRequests.get(item.id) !== sequence) return;
      patchSummaries(item.id, updated);
      uiMessage.success(
        !updated.enabled
          ? t("disabled")
          : updated.status === "published"
            ? t("enabledPublished")
            : t("enabledPending")
      );
    } catch (error: unknown) {
      if (enabledRequests.get(item.id) !== sequence) return;
      patchSummaries(item.id, { enabled: previous });
      await failed(error, t("toggleFailed"));
    }
  }

  function installAction(item: AgentTeamMarketplaceSummary): {
    label: string;
    disabled: boolean;
  } {
    const installed = installedVersions.value.get(item.id);
    if (installing.has(item.id))
      return { label: t("installing"), disabled: true };
    if (installed !== undefined && installed >= item.version) {
      return { label: t("installed"), disabled: true };
    }
    return {
      label:
        installed === undefined
          ? t("install")
          : t("installUpdate", { version: item.version }),
      disabled: item.status !== "published" || !item.enabled
    };
  }

  /** Installs run independently; the team store serializes their writes. */
  async function install(item: AgentTeamMarketplaceSummary): Promise<void> {
    const api = options.api();
    if (!api || installAction(item).disabled) return;
    installing.add(item.id);
    try {
      const result = await api.agentTeamMarketplace.install({ id: item.id });
      options.onCatalogChange(result.catalog);
      if (result.downloadCounted) {
        patchSummaries(item.id, { downloadCount: item.downloadCount + 1 });
      }
      uiMessage.success(t("installedAs", { name: result.teamName }));
    } catch (error: unknown) {
      await failed(error, t("installFailed"));
    } finally {
      installing.delete(item.id);
    }
  }

  async function confirmDelete(): Promise<void> {
    const api = options.api();
    const target = deleteTarget.value;
    if (!api || !target || deletePending.value) return;
    deletePending.value = true;
    try {
      await api.agentTeamMarketplace.delete({ id: target.id });
      deleteTarget.value = null;
      browse.items = browse.items.filter((item) => item.id !== target.id);
      uiMessage.success(t("deletedNotice"));
      await loadMine();
    } catch (error: unknown) {
      await failed(error, t("deleteFailed"));
    } finally {
      deletePending.value = false;
    }
  }

  return {
    session,
    authenticated,
    tab,
    browse,
    mine,
    filters,
    detail,
    detailLoadingId,
    installedVersions,
    installAction,
    deleteTarget,
    deletePending,
    applySession: updateSession,
    restoreSession,
    signedIn,
    logout,
    selectTab,
    setFilter,
    loadBrowse,
    loadMine,
    openDetail,
    toggleLike,
    setEnabled,
    install,
    confirmDelete
  };
}

export type TeamPlazaController = ReturnType<typeof useTeamPlaza>;
