import {
  registerMessageCatalog,
  setAppLanguage
} from "../../src/renderer/src/i18n";
import { messages } from "../../src/renderer/src/i18n/messages";

registerMessageCatalog("zh-CN", messages["zh-CN"]);
registerMessageCatalog("en-US", messages["en-US"]);
setAppLanguage("zh-CN", "zh-CN");
