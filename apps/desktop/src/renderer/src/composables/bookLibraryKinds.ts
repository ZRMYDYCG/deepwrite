import { createScopedTranslator } from "../i18n";
import type { MaterialKind, SkillKind } from "@deepwrite/contracts";

const t = createScopedTranslator("workspace");
export const MATERIAL_KINDS: ReadonlyArray<{
  id: MaterialKind;
  label: string;
  description: string;
}> = [
  {
    id: "character",
    get label() {
      return t("catalogWorkspace.characterMaterialLibrary");
    },
    get description() {
      return t("bookLibraryKinds.charactersAndRelationships");
    }
  },
  {
    id: "gimmick",
    get label() {
      return t("catalogWorkspace.storyIdeaLibrary");
    },
    get description() {
      return t("bookLibraryKinds.coreIdeasAndHooks");
    }
  },
  {
    id: "plot",
    get label() {
      return t("catalogWorkspace.plotMaterialLibrary");
    },
    get description() {
      return t("bookLibraryKinds.plotOpeningAndRefinement");
    }
  },
  {
    id: "draft",
    get label() {
      return t("catalogWorkspace.proseMaterialLibrary");
    },
    get description() {
      return t("bookLibraryKinds.proseExcerptsAndWritingReferences");
    }
  },
  {
    id: "other",
    get label() {
      return t("catalogWorkspace.otherMaterialLibrary");
    },
    get description() {
      return t("bookLibraryKinds.materialsOutsideTheCategoriesAbove");
    }
  }
];
export const SKILL_KINDS: ReadonlyArray<{
  id: SkillKind;
  label: string;
  description: string;
}> = [
  {
    id: "general",
    get label() {
      return t("catalogWorkspace.generalSkillLibrary");
    },
    get description() {
      return t("bookLibraryKinds.availableAcrossMultipleStages");
    }
  },
  {
    id: "plot",
    get label() {
      return t("catalogWorkspace.plotDesignSkillLibrary");
    },
    get description() {
      return t("bookLibraryKinds.characterPlotAndOutlineMethods");
    }
  },
  {
    id: "style",
    get label() {
      return t("catalogWorkspace.writingStyleSkillLibrary");
    },
    get description() {
      return t("bookLibraryKinds.manuscriptAndSectionWritingMethods");
    }
  },
  {
    id: "other",
    get label() {
      return t("catalogWorkspace.otherSkillLibrary");
    },
    get description() {
      return t("bookLibraryKinds.customWritingMethods");
    }
  }
];
