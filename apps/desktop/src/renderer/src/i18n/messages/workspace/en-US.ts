import selection from "./en-US-selection";
import builtins from "./en-US-builtins";
import conversations from "./en-US-conversations";
import settings from "./en-US-settings";
import catalog from "./en-US-catalog";
import editing from "./en-US-editing";
import novels from "./en-US-novels";
import proposals from "./en-US-proposals";

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
