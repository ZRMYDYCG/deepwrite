import type { InjectionKey, Ref } from "vue";

export const SIDEBAR_SELECTION_ACTIVE: InjectionKey<Readonly<Ref<boolean>>> =
  Symbol("sidebar-selection-active");
