export default {
  learnAndImitateAgentTeams: "学习仿写 · 智能体团队",
  agentTeams: "智能体团队",
  configureSpecialistSubagentsForEachPrimaryAgentInAdvance:
    "提前为每个主智能体配置可调用的专项子智能体。",
  configureSpecialistSubagentsForTheUnifiedValueAgent:
    "为统一{arg0}智能体配置可调用的专项子智能体。",
  screenplay: "剧本",
  shortStory: "短篇",
  subagentsUseThePrimaryAgentSModelByDefault:
    "子智能体默认跟随所属主智能体的模型；也可单独配置模型。它继承主智能体的工具与审批策略，但继承的工具不包含技能加载；不继承主智能体提示词、会话或技能库，且不能继续创建子智能体、不能绕过用户审批。每次调用以自己的系统提示词为主，运行时只额外附带可用工具清单和交接回主智能体的长度约束——它是直接用工具改文档，还是只把结论交回主智能体，完全由你写的系统提示词决定。",
  thisEnvironmentSupportsViewingOnlyUseTheDeepWriteDesktop:
    "当前环境仅支持查看；保存设置需要使用 DeepWrite 桌面端。",
  writingType: "创作类型",
  novel: "长篇",
  loadingAgentTeamSettings: "正在加载智能体团队设置…",
  agentTeamSettingsHaveNotLoaded: "智能体团队设置未加载",
  reload: "重新加载",
  noAgentTeamSettingsAvailable: "暂无可用的智能体团队设置。",
  valuePrimaryAgent: "{arg0}主智能体",
  primaryAgent: "主智能体",
  loadFromSkillLibrary: "从技能库加载",
  addSubagent: "新增子智能体",
  noSubagentsYet: "还没有子智能体",
  afterYouAddSubagentsThePrimaryAgentUsesTheir:
    "新增后，主智能体会根据能力说明决定何时委派任务。",
  untitledSubagent: "未命名子智能体",
  enabled: "已启用",
  disabled: "已停用",
  describeItsCapabilitiesSoThePrimaryAgentKnowsWhen:
    "补充能力说明，让主智能体知道何时调用它。",
  disable: "停用",
  enable: "启用",
  valueEnabledStatus: "{arg0}启用状态",
  subagent: "子智能体",
  editValue: "编辑{arg0}",
  duplicateValue: "复制{arg0}",
  duplicate: "复制",
  deleteValue: "删除{arg0}",
  modelSettings: "模型配置",
  subagentModelSettings: "子智能体模型配置",
  usePrimaryAgentModel: "跟随主智能体",
  configureModelSeparately: "单独配置模型",
  selectSubagentModel: "选择子智能体模型",
  selectAModel: "请选择模型",
  selectReasoningLevel: "选择思考等级",
  selectAReasoningLevel: "请选择思考等级",
  selectTemperature: "选择温度",
  selectATemperature: "请选择温度",
  noModelsAvailableAddOneInModelSettingsFirst:
    "暂无可用模型，请先在「模型配置」中添加。",
  name: "名称",
  forExampleContinuityReview: "例如：连续性审阅",
  capabilities: "能力说明",
  describeTheTasksItHandlesSoThePrimaryAgent:
    "说明擅长处理什么任务，供主智能体选择调用。",
  systemPrompt: "系统提示词",
  defineTheSubagentSRoleMethodsAndHandoffRequirements:
    "定义子智能体的职责、工作方法和交接要求。",
  doneEditing: "完成编辑",
  currentPrimaryAgent: "当前主智能体",
  saving: "保存中…",
  saveAgentTeam: "保存智能体团队",
  temperatureValue: "温度 {arg0}",
  thisTeamSupportsUpToValueSubagents: "当前团队最多配置 {arg0} 个子智能体",
  newSubagentValue: "新子智能体 {arg0}",
  copiedToTheCurrentDraftSaveTheAgentTeam:
    "已复制到当前草稿；保存智能体团队后生效",
  theSkillLibraryIsEmptyAddAnEntryIn: "技能库为空，请先在左侧技能库中添加条目",
  addedToThePrimaryAgentDraftSaveTheAgent:
    "已加入当前主智能体草稿；保存智能体团队后生效",
  separateConfigurationNoModelSelected: "单独配置（未选模型）",
  valueOffTemperatureValue: "{arg0} · 关闭 · 温度 {arg1}",
  removedFromTheCurrentDraftSaveTheAgentTeam:
    "已从当前草稿移除；保存智能体团队后生效",
  agentTeamConfigurationIsIncomplete: "智能体团队配置不完整",
  primaryAgentSubagentsMessage: "当前主智能体 {arg0}/{arg1}"
};
