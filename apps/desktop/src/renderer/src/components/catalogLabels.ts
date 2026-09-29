import { t } from "../i18n";
import type { TranslationKey } from "../i18n/messages";

// These keys are persisted contract values, not translated UI text.
const genreKeys: Readonly<Record<string, TranslationKey>> = {
  世情: "components.catalogLabels.socialFiction",
  追妻: "components.catalogLabels.romanticReconciliation",
  科幻: "components.catalogLabels.scienceFiction",
  悬疑: "components.catalogLabels.mystery",
  其他: "components.catalogLabels.other",
  玄幻: "components.catalogLabels.easternFantasy",
  奇幻: "components.catalogLabels.fantasy",
  武侠: "components.catalogLabels.martialArts",
  仙侠: "components.catalogLabels.cultivationFantasy",
  都市: "components.catalogLabels.urban",
  现实: "components.catalogLabels.realism",
  历史: "components.catalogLabels.historical",
  军事: "components.catalogLabels.military",
  言情: "components.catalogLabels.romance"
};
const formatKeys: Readonly<Record<string, TranslationKey>> = {
  正文: "components.catalogLabels.manuscript",
  设定: "components.catalogLabels.setting",
  技能: "components.catalogLabels.skill",
  素材: "components.catalogLabels.material",
  账本: "components.catalogLabels.ledger"
};
const fontKeys: Readonly<Record<string, TranslationKey>> = {
  system: "components.catalogLabels.fontSystem",
  sans: "components.catalogLabels.fontSans",
  song: "components.catalogLabels.fontSong",
  kai: "components.catalogLabels.fontKai",
  fangsong: "components.catalogLabels.fontFangsong",
  yuan: "components.catalogLabels.fontYuan"
};

export function genreLabel(value: string): string {
  const key = genreKeys[value];
  return key ? t(key) : value;
}

export function documentFormatLabel(value: string | undefined): string {
  const key = value && formatKeys[value];
  return key ? t(key) : (value ?? "");
}

export function builtinFontLabel(value: string, fallback: string): string {
  const key = fontKeys[value];
  return key ? t(key) : fallback;
}
