import {
  AgentTeamMarketplaceDetailSchema,
  AgentTeamMarketplacePageSchema,
  AgentTeamMarketplaceSettingsSchema,
  AgentTeamMarketplaceSummarySchema,
  type AgentTeamMarketplaceDetail,
  type AgentTeamMarketplaceListFilter,
  type AgentTeamMarketplacePage,
  type AgentTeamMarketplaceSummary
} from "@deepwrite/contracts";
import {
  asRecord,
  MarketplaceClientError,
  optionalString,
  requiredBoolean,
  requiredNumber,
  requiredString
} from "../../main/marketplace-response";

function optionalTimestamp(
  value: Record<string, unknown>,
  key: string,
  field: string
): Record<string, string> {
  const timestamp = optionalString(value, key);
  return timestamp ? { [field]: timestamp } : {};
}

export function normalizeTeamSummary(
  raw: unknown
): AgentTeamMarketplaceSummary {
  const value = asRecord(raw, "团队摘要");
  return AgentTeamMarketplaceSummarySchema.parse({
    id: requiredString(value, "id"),
    ...(optionalString(value, "owner_user_id")
      ? { ownerUserId: optionalString(value, "owner_user_id") }
      : {}),
    title: requiredString(value, "title"),
    overview: requiredString(value, "overview"),
    workspaceType: requiredString(value, "workspace_type"),
    memberCount: requiredNumber(value, "member_count"),
    version: requiredNumber(value, "version"),
    visibility: requiredString(value, "visibility"),
    status: requiredString(value, "status"),
    enabled: requiredBoolean(value, "enabled"),
    downloadCount: requiredNumber(value, "download_count"),
    likeCount: requiredNumber(value, "like_count"),
    likedByMe: requiredBoolean(value, "liked_by_me"),
    ownerUsername: requiredString(value, "owner_username"),
    ownerName: requiredString(value, "owner_name"),
    ...optionalTimestamp(value, "published_at", "publishedAt"),
    ...optionalTimestamp(value, "deleted_at", "deletedAt"),
    ...optionalTimestamp(value, "purge_at", "purgeAt"),
    createdAt: requiredString(value, "created_at"),
    updatedAt: requiredString(value, "updated_at")
  });
}

export function normalizeTeamPage(raw: unknown): AgentTeamMarketplacePage {
  const value = asRecord(raw, "团队列表");
  if (!Array.isArray(value.items)) {
    throw new MarketplaceClientError(
      "marketplace.invalid_response",
      "团队广场分页列表缺少有效的 items。"
    );
  }
  return AgentTeamMarketplacePageSchema.parse({
    items: value.items.map(normalizeTeamSummary),
    page: requiredNumber(value, "page"),
    pageSize: requiredNumber(value, "page_size"),
    total: requiredNumber(value, "total"),
    totalPages: requiredNumber(value, "total_pages")
  });
}

export function normalizeTeamDetail(raw: unknown): AgentTeamMarketplaceDetail {
  const value = asRecord(raw, "团队详情");
  const team = AgentTeamMarketplaceSettingsSchema.safeParse(value.team);
  if (!team.success) {
    throw new MarketplaceClientError(
      "agent_team_marketplace.unsupported_team",
      "该团队使用了当前版本无法识别的配置，请升级 DeepWrite 后再查看或安装。"
    );
  }
  return AgentTeamMarketplaceDetailSchema.parse({
    ...normalizeTeamSummary(value),
    team: team.data
  });
}

export function teamFilterQuery(
  filter: AgentTeamMarketplaceListFilter
): string {
  const query = new URLSearchParams();
  if (filter.query) query.set("q", filter.query);
  if (filter.workspaceType) query.set("workspace_type", filter.workspaceType);
  if (filter.status) query.set("status", filter.status);
  if (filter.sort) query.set("sort", filter.sort);
  query.set("page", String(filter.page ?? 1));
  query.set("page_size", String(filter.pageSize ?? 20));
  return `?${query.toString()}`;
}

export function teamPath(id?: string, action?: string): string {
  return `/market/v1/agent-teams${id ? `/${encodeURIComponent(id)}` : ""}${
    action ? `/${action}` : ""
  }`;
}
