import { createScopedTranslator } from "../i18n";
import type { IconName } from "../types/workspace";

const t = createScopedTranslator("components.sidebarMoreFeatures");
export const moreFeatures: Array<{
  id:
    | "chat-assistant"
    | "long-book-analysis"
    | "revision-analysis"
    | "short-book-analysis"
    | "style-comparison"
    | "skill-marketplace"
    | "cloud-backup"
    | "device-sync"
    | "zhuque-detection";
  label: string;
  description: string;
  icon: IconName;
}> = [
  {
    id: "chat-assistant",
    get label() {
      return t("chat");
    },
    get description() {
      return t("openStandaloneChatAssistant");
    },
    icon: "message"
  },
  {
    id: "short-book-analysis",
    get label() {
      return t("shortStoryAnalysis");
    },
    get description() {
      return t("analyzeFullWorksCombiningUpTo10Books");
    },
    icon: "book"
  },
  {
    id: "long-book-analysis",
    get label() {
      return t("novelAnalysis");
    },
    get description() {
      return t("extractNovelPlotCharactersAndStyleInBatches");
    },
    icon: "book"
  },
  {
    id: "revision-analysis",
    get label() {
      return t("revisionAnalysis");
    },
    get description() {
      return t("learnReusableSkillsFromManuscriptRevisions");
    },
    icon: "file"
  },
  {
    id: "style-comparison",
    get label() {
      return t("styleComparison");
    },
    get description() {
      return t("compareTheStyleAndSimilarityOfTwoTexts");
    },
    icon: "file"
  },
  {
    id: "skill-marketplace",
    get label() {
      return t("skillMarketplace");
    },
    get description() {
      return t("discoverInstallAndPublishWritingSkills");
    },
    icon: "globe"
  },
  {
    id: "device-sync",
    get label() {
      return t("deviceSync");
    },
    get description() {
      return t("continueWritingUsingYourOwnCloudDrive");
    },
    icon: "archive"
  },
  {
    id: "cloud-backup",
    get label() {
      return t("cloudBackup");
    },
    get description() {
      return t("backUpTheWorkspaceAndReferences");
    },
    icon: "archive"
  },
  {
    id: "zhuque-detection",
    get label() {
      return t("aITextDetection");
    },
    get description() {
      return t("detectAIGeneratedText");
    },
    icon: "globe"
  }
];
