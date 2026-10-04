const STEPS = [
  "startup",
  "model-catalog",
  "model-capacity",
  "model-enable",
  "source-load",
  "source-confirm",
  "profile-load",
  "profile-save",
  "target-create",
  "target-check",
  "package-start",
  "attempt-load",
  "package-wait",
  "package-finish",
  "phase-advance"
];
const PHASES = [
  "prepare_target",
  "read",
  "registry",
  "registry_review",
  "integrate",
  "review",
  "finalize",
  "done"
];
const UNIT_STATUSES = [
  "pending",
  "running",
  "writing",
  "done",
  "failed",
  "skipped",
  "conflict"
];
const JOB_STATUSES = [
  "idle",
  "running",
  "stopped",
  "failed",
  "completed",
  "waiting_capacity"
];
const FIELDS = [
  "source",
  "confirmation",
  "profile",
  "modelId",
  "thinkingLevel",
  "contextWindow",
  "maxTokens",
  "worldCategories",
  "id",
  "targetSelection",
  "unitId",
  "data",
  "kind",
  "card",
  "chunkId",
  "chapters",
  "chapterId",
  "order",
  "title",
  "summary",
  "characters",
  "world",
  "plot",
  "style",
  "registry",
  "asset",
  "review"
];
const TOOL_NAMES = [
  "spawn_subagent",
  "get_decomposition_status",
  "list_registry",
  "read_card_digest",
  "read_chunk_text",
  "search_chunk",
  "search_source",
  "read_cards",
  "search_cards",
  "read_mentions",
  "read_character_mentions",
  "read_world_mentions",
  "read_style_notes",
  "sample_passages",
  "read_assets",
  "read_chronicles",
  "read_foreshadowing_notes",
  "submit_chapter_reading",
  "finish_reading_card",
  "submit_registry_part",
  "write_chronicle",
  "write_book_line",
  "write_foreshadowing",
  "write_opening",
  "write_character_dossier",
  "write_character_biography",
  "write_world_category",
  "write_style_profile",
  "write_latest_continuity",
  "report_review_issues",
  "write_topic",
  "plan_decomposition_topic"
];
const REASONS = [
  "来源与持久化确认回执不一致。",
  "拆解模型不可用，请重新选择。",
  "整书拆解模型窗口至少需要 16,000 token。",
  "模型窗口不足以容纳拆解方案。",
  "所选模型不存在，请刷新模型配置后重试。",
  "模型 API Key 解密失败，请在模型配置中重新填写并保存。",
  "系统安全存储当前不可用，无法解密这个模型的 API Key。",
  "运行模型必须与任务快照一致。",
  "拆解方案已不存在，请刷新后重试。",
  "拆解子任务必须在任务说明中写明本包的单元 id。",
  "阅读检查点每次必须完整提交一章或一个片段。",
  "章节提交范围不匹配。",
  "未知世界观类别。",
  "阅读块仍有未持久化的章节或片段。",
  "阅读卡的章节身份、章号或标题与确认来源不一致。",
  "阅读片段中的摘录必须来自当前片段。",
  "提交单元不在本工作包授权范围内。",
  "角色提交类型不匹配。",
  "阅读提交类型不匹配。",
  "提交类型不匹配。",
  "事实必须来自提交的章节。",
  "成品键与结构不匹配。",
  "每个原始名字必须归属或明确忽略。"
];
const CHECKS = [
  "real-model trial requires an explicitly selected model id",
  "no eligible free model is available for the real-model trial",
  "selected model window is too small",
  "target not prepared",
  "unexpected runtime",
  "attempt not persisted",
  "decomposition package timed out",
  "package coverage incomplete",
  "job did not complete",
  "native ledger invalid",
  "native entities invalid",
  "recovered target contents differ",
  "result references missing",
  "output preceded durable target notification",
  ...STEPS.map((step) => `trial step ${step} failed`),
  "models.refresh_free_failed",
  "models.resolve_capacity_failed",
  "models.set_free_model_enabled_failed",
  "decomposition.command_failed",
  "decomposition.core_failed",
  "extras_agent.run_failed",
  "agent.capacity_reached",
  "agent.extras_capacity_reached",
  "agent.runtime_error",
  "agent.run_failed",
  "agent.stream_failed",
  ...[400, 401, 402, 403, 404, 408, 413, 429, 500, 502, 503, 504].map(
    (status) => `provider-http-${status}`
  ),
  ...REASONS
];

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isCount = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
function safeCounts(raw, keys) {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(
    keys.filter((key) => isCount(raw[key])).map((key) => [key, raw[key]])
  );
}

function parseDiagnostic(output) {
  const prefix = "DECOMP_TRIAL_DIAGNOSTIC ";
  const line = output
    .split(/\r?\n/u)
    .findLast((value) => value.startsWith(prefix));
  if (!line) return null;
  let raw;
  try {
    raw = JSON.parse(line.slice(prefix.length));
  } catch {
    return null;
  }
  if (!isRecord(raw) || !STEPS.includes(raw.step)) return null;
  const result = { step: raw.step };
  if (PHASES.includes(raw.phase)) result.phase = raw.phase;
  if (JOB_STATUSES.includes(raw.status)) result.status = raw.status;
  Object.assign(
    result,
    safeCounts(raw, ["done", "units", "targetEvents", "outputEvents"])
  );
  if (isRecord(raw.tools))
    result.tools = Object.fromEntries(
      TOOL_NAMES.filter((name) => isRecord(raw.tools[name])).map((name) => [
        name,
        safeCounts(raw.tools[name], ["calls", "errors"])
      ])
    );
  if (isRecord(raw.childStatuses))
    result.childStatuses = safeCounts(raw.childStatuses, [
      "completed",
      "error",
      "aborted",
      "skipped"
    ]);
  if (isRecord(raw.unitStatuses))
    result.unitStatuses = safeCounts(raw.unitStatuses, UNIT_STATUSES);
  if (Array.isArray(raw.failures)) {
    const allowed = [
      ...REASONS,
      ...FIELDS.map((field) => `schema:${field}`),
      "provider-tool-schema",
      "context-budget",
      "child-timeout",
      "missing-unit-identity",
      "wrong-role",
      "dispatch-limit",
      "reading-block-limit",
      ...[400, 401, 402, 403, 404, 408, 413, 429, 500, 502, 503, 504].map(
        (status) => `provider-http-${status}`
      )
    ];
    result.failures = [
      ...new Set(raw.failures.filter((failure) => allowed.includes(failure)))
    ];
  }
  return result;
}

/** Provider text never becomes diagnostic output; only fixed literals and counts do. */
export function summarizeDecompositionTrialFailure(output) {
  const fields =
    output.match(/schema fields ([a-zA-Z,]+)/u)?.[1]?.split(",") ?? [];
  return {
    smokeFailureMarker: output.includes("DEEPWRITE_SMOKE_FAIL "),
    failedChecks: CHECKS.filter((check) => output.includes(check)),
    ...(fields.length
      ? { schemaFields: FIELDS.filter((field) => fields.includes(field)) }
      : {}),
    diagnostic: parseDiagnostic(output)
  };
}
