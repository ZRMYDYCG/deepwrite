export function createDecompositionTrialDiagnostics(realModel: boolean) {
  const diagnostic = {
    step: "startup",
    phase: "",
    status: "",
    done: 0,
    units: 0,
    targetEvents: 0,
    outputEvents: 0,
    tools: {} as Record<string, { calls: number; errors: number }>,
    childStatuses: {} as Record<string, number>,
    unitStatuses: {} as Record<string, number>,
    failures: [] as string[]
  };
  (
    globalThis as unknown as { decompositionTrialDiagnostic: typeof diagnostic }
  ).decompositionTrialDiagnostic = diagnostic;
  const trialRequest = async <T>(step: string, request: () => Promise<T>) => {
    diagnostic.step = step;
    try {
      return await request();
    } catch (error) {
      if (!realModel) throw error;
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      const safeCodes = [
        "models.refresh_free_failed",
        "models.resolve_capacity_failed",
        "models.set_free_model_enabled_failed",
        "decomposition.command_failed",
        "decomposition.core_failed",
        "extras_agent.run_failed",
        "agent.capacity_reached",
        "agent.extras_capacity_reached",
        "agent.runtime_error",
        "agent.run_failed"
      ];
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "";
      const reasons = [
        "来源与持久化确认回执不一致。",
        "拆解模型不可用，请重新选择。",
        "整书拆解模型窗口至少需要 16,000 token。",
        "模型窗口不足以容纳拆解方案。",
        "所选模型不存在，请刷新模型配置后重试。",
        "模型 API Key 解密失败，请在模型配置中重新填写并保存。",
        "系统安全存储当前不可用，无法解密这个模型的 API Key。",
        "运行模型必须与任务快照一致。",
        "拆解方案已不存在，请刷新后重试。"
      ];
      const reason = reasons.find((value) => message.includes(value));
      const fields = [
        "source",
        "confirmation",
        "profile",
        "modelId",
        "thinkingLevel",
        "contextWindow",
        "maxTokens",
        "worldCategories",
        "id",
        "targetSelection"
      ].filter((field) => message.includes(`"${field}"`));
      throw new Error(
        `Decomposition smoke: trial step ${step} failed${safeCodes.includes(code) ? ` (${code})` : ""}${reason ? ` reason ${reason}` : ""}${fields.length ? ` schema fields ${fields.join(",")}` : ""}`
      );
    }
  };
  const recordFailure = (summary: string) => {
    const kinds = [
      ["provider-tool-schema", "参数 schema"],
      ["context-budget", "预算"],
      ["child-timeout", "超时"],
      ["missing-unit-identity", "本包的单元 id"],
      ["wrong-role", "未知拆解角色"],
      ["dispatch-limit", "最多分派两次"],
      ["reading-block-limit", "只能处理一个阅读块"]
    ];
    for (const [kind, hint] of kinds)
      if (summary.includes(hint!) && !diagnostic.failures.includes(kind!))
        diagnostic.failures.push(kind!);
    const status = summary.match(
      /(?:^|[:：]\s*|\bHTTP\s+|\b(?:status(?:Code)?|code)["\s:]+)(400|401|402|403|404|408|413|429|500|502|503|504)\b/u
    )?.[1];
    if (status && !diagnostic.failures.includes(`provider-http-${status}`))
      diagnostic.failures.push(`provider-http-${status}`);
  };
  const recordTool = (name: string, isError: boolean, summary: string) => {
    const allowed = [
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
    if (!allowed.includes(name)) return;
    const count = (diagnostic.tools[name] ??= { calls: 0, errors: 0 });
    count.calls++;
    if (isError || name === "spawn_subagent") recordFailure(summary);
    if (!isError) return;
    count.errors++;
    const reasons = [
      "拆解子任务必须在任务说明中写明本包的单元 id",
      "阅读检查点每次必须完整提交一章或一个片段。",
      "章节提交范围不匹配。",
      "未知世界观类别。",
      "阅读块仍有未持久化的章节或片段。",
      "阅读卡的章节身份、章号或标题与确认来源不一致。",
      "阅读片段中的摘录必须来自当前片段。",
      "提交单元不在本工作包授权范围内。",
      "事实必须来自提交的章节。",
      "成品键与结构不匹配。",
      "每个原始名字必须归属或明确忽略。"
    ];
    for (const reason of reasons)
      if (summary.includes(reason) && !diagnostic.failures.includes(reason))
        diagnostic.failures.push(reason);
    for (const field of [
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
    ])
      if (
        (summary.includes(`"${field}"`) || summary.includes(`/${field}`)) &&
        !diagnostic.failures.includes(`schema:${field}`)
      )
        diagnostic.failures.push(`schema:${field}`);
  };
  return { diagnostic, trialRequest, recordTool, recordFailure };
}
