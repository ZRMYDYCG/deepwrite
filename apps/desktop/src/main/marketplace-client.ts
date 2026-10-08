import {
  CatalogInstallMarketplaceSkillContentResultSchema,
  CatalogSnapshotSchema,
  MarketplaceContentRefSchema,
  MarketplaceInstallInputSchema,
  MarketplaceInstallPackageSchema,
  MarketplaceInstallPreviewSchema,
  MarketplaceInstallResultSchema,
  MarketplaceLikeInputSchema,
  MarketplaceLikeResultSchema,
  MarketplaceListFilterSchema,
  MarketplacePublishInputSchema,
  MarketplaceSetEnabledInputSchema,
  MarketplaceUpdateInputSchema,
  type CatalogSnapshot,
  type MarketplaceContentDetail,
  type MarketplaceContentPage,
  type MarketplaceContentRef,
  type MarketplaceContentSummary,
  type MarketplaceInstallBucket,
  type MarketplaceInstallInput,
  type MarketplaceInstallPackage,
  type MarketplaceInstallPreview,
  type MarketplaceInstallResult,
  type MarketplaceLikeInput,
  type MarketplaceLikeResult,
  type MarketplaceListFilter,
  type MarketplacePublishInput,
  type MarketplaceSetEnabledInput,
  type MarketplaceSkillDetail,
  type MarketplaceSkillKind,
  type MarketplaceUpdateInput
} from "@deepwrite/contracts";

import { MarketplaceAccountClient } from "./marketplace-account-client";
import type { MarketplaceClientOptions } from "./marketplace-client-options";
import {
  publishPath,
  requestBody,
  uniqueLibraryTypes
} from "./marketplace-publish-wire";
import {
  asRecord,
  MarketplaceClientError,
  normalizeContentPage,
  normalizeDetail,
  normalizeSummary,
  requiredBoolean,
  requiredNumber
} from "./marketplace-response";
export type { MarketplaceClientOptions } from "./marketplace-client-options";
export { MarketplaceClientError } from "./marketplace-response";
export class MarketplaceClient extends MarketplaceAccountClient {
  private readonly loadCatalogSnapshot:
    (() => Promise<CatalogSnapshot>) | undefined;
  private readonly installCatalogPackage:
    MarketplaceClientOptions["installPackage"] | undefined;
  constructor(userDataPath: string, options: MarketplaceClientOptions = {}) {
    super(userDataPath, options);
    this.loadCatalogSnapshot = options.loadCatalogSnapshot;
    this.installCatalogPackage = options.installPackage;
  }
  async list(
    filter: MarketplaceListFilter = {}
  ): Promise<MarketplaceContentPage> {
    const parsed = MarketplaceListFilterSchema.parse(filter);
    const data = await this.request(
      "GET",
      `/market/v1/skill-content${this.filterQuery(parsed)}`,
      {
        authenticated: "optional"
      }
    );
    return normalizeContentPage(data);
  }

  async detail(ref: MarketplaceContentRef): Promise<MarketplaceContentDetail> {
    const parsed = MarketplaceContentRefSchema.parse(ref);
    const data = await this.request(
      "GET",
      `/market/v1/skill-content/${parsed.contentType}/${encodeURIComponent(parsed.id)}`,
      { authenticated: false }
    );
    return normalizeDetail(parsed.contentType, data);
  }

  async listMine(
    filter: MarketplaceListFilter = {}
  ): Promise<MarketplaceContentPage> {
    const parsed = MarketplaceListFilterSchema.parse(filter);
    const data = await this.request(
      "GET",
      `/market/v1/me/skill-content${this.filterQuery(parsed)}`,
      { authenticated: true }
    );
    return normalizeContentPage(data);
  }

  async myDetail(
    ref: MarketplaceContentRef
  ): Promise<MarketplaceContentDetail> {
    const parsed = MarketplaceContentRefSchema.parse(ref);
    const data = await this.request(
      "GET",
      `/market/v1/me/skill-content/${parsed.contentType}/${encodeURIComponent(parsed.id)}`,
      { authenticated: true }
    );
    return normalizeDetail(parsed.contentType, data);
  }

  async publish(
    input: MarketplacePublishInput
  ): Promise<MarketplaceContentDetail> {
    const parsed = MarketplacePublishInputSchema.parse(input);
    const data = await this.request("POST", publishPath(parsed), {
      authenticated: true,
      body: requestBody(parsed)
    });
    const detail = normalizeDetail(parsed.contentType, data);
    if (detail.enabled) return detail;
    try {
      const enabled = await this.setEnabled({
        contentType: detail.contentType,
        id: detail.id,
        enabled: true
      });
      return {
        ...detail,
        enabled: enabled.enabled,
        updatedAt: enabled.updatedAt
      };
    } catch {
      // The upload succeeded; let the author enable it without publishing again.
      return detail;
    }
  }

  async update(
    input: MarketplaceUpdateInput
  ): Promise<MarketplaceContentDetail> {
    const parsed = MarketplaceUpdateInputSchema.parse(input);
    const data = await this.request(
      "PUT",
      publishPath(parsed.content, parsed.id),
      {
        authenticated: true,
        body: requestBody(parsed.content)
      }
    );
    return normalizeDetail(parsed.content.contentType, data);
  }

  async setEnabled(
    input: MarketplaceSetEnabledInput
  ): Promise<MarketplaceContentSummary> {
    const parsed = MarketplaceSetEnabledInputSchema.parse(input);
    const data = await this.request(
      "PUT",
      `/market/v1/skill-content/${parsed.contentType}/${encodeURIComponent(parsed.id)}/enabled`,
      { authenticated: true, body: { enabled: parsed.enabled } }
    );
    return normalizeSummary(data);
  }

  async delete(ref: MarketplaceContentRef): Promise<void> {
    const parsed = MarketplaceContentRefSchema.parse(ref);
    await this.request(
      "DELETE",
      `/market/v1/skill-content/${parsed.contentType}/${encodeURIComponent(parsed.id)}`,
      { authenticated: true }
    );
  }

  async like(input: MarketplaceLikeInput): Promise<MarketplaceLikeResult> {
    const parsed = MarketplaceLikeInputSchema.parse(input);
    const data = asRecord(
      await this.request(
        parsed.liked ? "POST" : "DELETE",
        `/market/v1/skill-content/${parsed.contentType}/${encodeURIComponent(parsed.id)}/like`,
        { authenticated: true }
      ),
      "点赞结果"
    );
    return MarketplaceLikeResultSchema.parse({
      liked: requiredBoolean(data, "liked"),
      likeCount: requiredNumber(data, "like_count")
    });
  }

  async previewInstall(
    ref: MarketplaceContentRef
  ): Promise<MarketplaceInstallPreview> {
    const parsed = MarketplaceContentRefSchema.parse(ref);
    const detail = await this.detail(parsed);
    const installPackage = await this.buildInstallPackage(detail);
    const snapshot = this.loadCatalogSnapshot
      ? CatalogSnapshotSchema.parse(await this.loadCatalogSnapshot())
      : undefined;
    const alreadyInstalled = snapshot
      ? this.hasInstalledVersion(snapshot, parsed, detail.version)
      : false;
    return MarketplaceInstallPreviewSchema.parse({
      ref: parsed,
      title: detail.title,
      version: detail.version,
      alreadyInstalled,
      buckets: installPackage.buckets,
      ...(detail.contentType === "group" && installPackage.buckets.length > 1
        ? {
            orderNotice:
              "技能组会按技能分类归并为本地技能库；同类成员顺序保留，跨分类的原始交错顺序无法保留。"
          }
        : {})
    });
  }

  async install(
    input: MarketplaceInstallInput
  ): Promise<MarketplaceInstallResult> {
    const parsed = MarketplaceInstallInputSchema.parse(input);
    if (!this.installCatalogPackage) {
      throw new MarketplaceClientError(
        "marketplace.install_unavailable",
        "本地技能安装服务尚未初始化。"
      );
    }
    const detail = await this.detail(parsed.ref);
    if (detail.contentType === "skill" && !parsed.targetLibraryId) {
      throw new MarketplaceClientError(
        "marketplace.target_library_required",
        "安装单技能前请选择目标技能库。"
      );
    }
    if (detail.contentType !== "skill" && parsed.targetLibraryId) {
      throw new MarketplaceClientError(
        "marketplace.target_library_not_allowed",
        "技能库和技能组会直接创建本地技能库，不能指定已有技能库。"
      );
    }
    const basePackage = await this.buildInstallPackage(detail);
    const installPackage = MarketplaceInstallPackageSchema.parse({
      ...basePackage,
      ...(parsed.targetLibraryId
        ? { targetLibraryId: parsed.targetLibraryId }
        : {}),
      buckets: basePackage.buckets.map((bucket) => ({
        ...bucket,
        libraryType:
          parsed.libraryTypesByKind?.[bucket.kind] ?? bucket.libraryType
      }))
    });
    const installed = CatalogInstallMarketplaceSkillContentResultSchema.parse(
      await this.installCatalogPackage(installPackage)
    );
    if (installed.alreadyInstalled) {
      return MarketplaceInstallResultSchema.parse({
        ...installed,
        downloadCounted: false
      });
    }
    let downloadCounted = true;
    try {
      await this.request(
        "POST",
        `/market/v1/skill-content/${parsed.ref.contentType}/${encodeURIComponent(parsed.ref.id)}/download`,
        { authenticated: false }
      );
    } catch {
      downloadCounted = false;
    }
    return MarketplaceInstallResultSchema.parse({
      ...installed,
      downloadCounted
    });
  }

  private async buildInstallPackage(
    detail: MarketplaceContentDetail
  ): Promise<MarketplaceInstallPackage> {
    const orderedSkills: MarketplaceSkillDetail[] = [];
    if (detail.contentType === "skill") {
      orderedSkills.push(detail);
    } else if (detail.contentType === "library") {
      orderedSkills.push(...detail.skills);
    } else {
      for (const item of detail.items) {
        const child = await this.detail({
          contentType: item.contentType,
          id: item.id
        });
        if (child.contentType === "skill") orderedSkills.push(child);
        if (child.contentType === "library")
          orderedSkills.push(...child.skills);
      }
    }
    const kinds: MarketplaceSkillKind[] = ["general", "plot", "style", "other"];
    const buckets: MarketplaceInstallBucket[] = kinds.flatMap((kind) => {
      const values = orderedSkills.filter((skill) => skill.kind === kind);
      if (values.length === 0) return [];
      const availableLibraryTypes = uniqueLibraryTypes(
        values.map((skill) => skill.libraryType)
      );
      return [
        {
          kind,
          libraryType: availableLibraryTypes[0]!,
          availableLibraryTypes,
          entries: values.map((skill) => ({
            marketplaceSkillId: skill.id,
            title: skill.title,
            stageId: skill.stageId,
            content: skill.content
          }))
        }
      ];
    });
    if (buckets.length === 0) {
      throw new MarketplaceClientError(
        "marketplace.empty_content",
        "该内容没有可安装的技能。"
      );
    }
    return MarketplaceInstallPackageSchema.parse({
      source: {
        contentType: detail.contentType,
        contentId: detail.id,
        version: detail.version
      },
      title: detail.title,
      overview: detail.overview,
      buckets,
      createGroup: detail.contentType === "group"
    });
  }

  private hasInstalledVersion(
    snapshot: CatalogSnapshot,
    ref: MarketplaceContentRef,
    version: number
  ): boolean {
    const matches = (
      source: CatalogSnapshot["skills"][number]["marketplaceSource"]
    ) =>
      source?.contentType === ref.contentType &&
      source.contentId === ref.id &&
      source.version === version;
    return (
      snapshot.skills.some(
        (library) =>
          matches(library.marketplaceSource) ||
          library.entries.some((entry) => matches(entry.marketplaceSource))
      ) ||
      snapshot.skillGroups.some((group) => matches(group.marketplaceSource))
    );
  }

  private filterQuery(filter: MarketplaceListFilter): string {
    const query = new URLSearchParams();
    if (filter.query) query.set("q", filter.query);
    if (filter.contentType) query.set("content_type", filter.contentType);
    if (filter.kind) query.set("kind", filter.kind);
    if (filter.libraryType) query.set("library_type", filter.libraryType);
    if (filter.status) query.set("status", filter.status);
    if (filter.sort) query.set("sort", filter.sort);
    query.set("page", String(filter.page ?? 1));
    query.set("page_size", String(filter.pageSize ?? 20));
    const value = query.toString();
    return value ? `?${value}` : "";
  }
}
