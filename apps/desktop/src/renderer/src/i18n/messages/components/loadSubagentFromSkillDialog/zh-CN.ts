export default {
  writeDocuments: "直接写入文档",
  returnConclusions: "只交回结论",
  selectUpToValueSkillsAtOnce: "一次最多选择 {arg0} 条技能",
  generationIsRunningStopItBeforeClosing: "生成进行中，请先停止后再关闭",
  selectAtLeastOneSkill: "请先选择至少一条技能",
  selectAGenerationModel: "请选择用于生成的模型",
  generateAndCompleteTheSubagentDraftFirst: "请先生成并填写完整的子智能体草稿",
  agentTeamsSkillsToSubagent: "智能体团队 · 技能转子智能体",
  loadFromSkillLibrary: "从技能库加载",
  generateASubagentDraftFor: "为「",
  fromSkillsConfirmTheOutputMethodFirstThenA:
    "」从技能库生成子智能体草稿。请先确认产出方式，再由带工具的小智能体整理提示词。",
  close: "关闭",
  text1SelectSkills: "1. 选择技能",
  chooseSkillsFromAnyLibraryOrStageTheirContent:
    "可从全部技能库、全部阶段选择技能。生成时会读取所选技能正文，并将技能要点写入子智能体系统提示词。",
  noSkillEntriesAvailableAddSkillsToTheLibrary:
    "当前技能库中没有技能条目，请先在技能库中添加技能。",
  text2ConfirmOutputMethod: "2. 确认产出方式",
  thisDeterminesWhetherTheGeneratedSystemPromptDirectsThe:
    "这决定生成的系统提示词如何约束子智能体：直接改文档，还是只把结论交回主智能体。",
  outputMethod: "产出方式",
  theSubagentEditsDocumentsWithWriteReplaceToolsAnd:
    "子智能体用写入 / 替换工具改文档，交接摘要只说明改动。",
  theSubagentReportsConclusionsAndKeyPointsWithoutEditing:
    "子智能体只交回结论与要点，不直接改文档。",
  text3GenerateDraft: "3. 生成草稿",
  generationModel: "生成模型",
  selectModel: "选择模型",
  generating: "生成中…",
  generateSubagentDraft: "生成子智能体草稿",
  stop: "停止",
  text4ReviewDraft: "4. 确认草稿",
  name: "名称",
  capabilities: "能力说明",
  systemPrompt: "系统提示词",
  cancel: "取消",
  addToTeamDraft: "加入团队草稿",
  generateASubagentDraftForFromSkillsMessage:
    "为「{arg0}」从技能库生成子智能体草稿。请先确认产出方式，再由带工具的小智能体整理提示词。"
};
