import foundationZh from "./foundation/zh-CN";
import foundationEn from "./foundation/en-US";
import extrasZh from "./extras/zh-CN";
import extrasEn from "./extras/en-US";
import workspaceZh from "./workspace/zh-CN";
import workspaceEn from "./workspace/en-US";
import componentsZh from "./components/zh-CN";
import componentsEn from "./components/en-US";

export const messages = {
  "zh-CN": {
    foundation: foundationZh,
    extras: extrasZh,
    workspace: workspaceZh,
    components: componentsZh
  },
  "en-US": {
    foundation: foundationEn,
    extras: extrasEn,
    workspace: workspaceEn,
    components: componentsEn
  }
};

type MessageKeys<Value> = {
  [Key in keyof Value & string]: Value[Key] extends string
    ? Key
    : `${Key}.${MessageKeys<Value[Key]>}`;
}[keyof Value & string];

export type TranslationKey = MessageKeys<(typeof messages)["zh-CN"]>;

export type MessageSchema = (typeof messages)["zh-CN"];
