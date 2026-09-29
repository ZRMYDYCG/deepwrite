import selection from "./zh-CN-selection";
import builtins from "./zh-CN-builtins";
import conversations from "./zh-CN-conversations";
import settings from "./zh-CN-settings";
import catalog from "./zh-CN-catalog";
import editing from "./zh-CN-editing";
import novels from "./zh-CN-novels";
import proposals from "./zh-CN-proposals";

export default {
  selection,
  builtins,
  ...conversations,
  ...settings,
  ...catalog,
  ...editing,
  ...novels,
  ...proposals
};
