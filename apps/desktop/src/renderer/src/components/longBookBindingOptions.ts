import { createScopedTranslator } from "../i18n";
import type { MaterialKind, SkillKind } from "@deepwrite/contracts";

const t = createScopedTranslator("components.longBookBindingOptions");

export const LONG_MATERIAL_BINDING_KINDS: ReadonlyArray<{
  id: MaterialKind;
  label: string;
  description: string;
}> = [
  {
    id: "character",
    get label() {
      return t("characterMaterialLibrary");
    },
    get description() {
      return t("charactersAndRelationships");
    }
  },
  {
    id: "gimmick",
    get label() {
      return t("ideaMaterialLibrary");
    },
    get description() {
      return t("coreIdeasAndHooks");
    }
  },
  {
    id: "plot",
    get label() {
      return t("plotMaterialLibrary");
    },
    get description() {
      return t("plotIntroductionAndDevelopment");
    }
  },
  {
    id: "draft",
    get label() {
      return t("manuscriptMaterialLibrary");
    },
    get description() {
      return t("manuscriptExcerptsAndExpressionReferences");
    }
  },
  {
    id: "other",
    get label() {
      return t("otherMaterialLibrary");
    },
    get description() {
      return t("materialsOutsideTheCategoriesAbove");
    }
  }
];

export const LONG_SKILL_BINDING_KINDS: ReadonlyArray<{
  id: SkillKind;
  label: string;
  description: string;
}> = [
  {
    id: "general",
    get label() {
      return t("generalSkillLibrary");
    },
    get description() {
      return t("availableAcrossStages");
    }
  },
  {
    id: "plot",
    get label() {
      return t("plotDesignSkillLibrary");
    },
    get description() {
      return t("characterPlotAndOutliningMethods");
    }
  },
  {
    id: "style",
    get label() {
      return t("writingStyleSkillLibrary");
    },
    get description() {
      return t("manuscriptAndChapterWritingMethods");
    }
  },
  {
    id: "other",
    get label() {
      return t("otherSkillLibrary");
    },
    get description() {
      return t("customWritingMethods");
    }
  }
];
