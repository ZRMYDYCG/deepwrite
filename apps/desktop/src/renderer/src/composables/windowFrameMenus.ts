import { type InjectionKey, type Ref } from "vue";
import type { PopupSelectOption } from "../types/popupSelect";

export interface WindowFrameMenu {
  id: "file" | "view" | "help";
  label: string;
  options: readonly PopupSelectOption[];
  run(value: string): void | Promise<void>;
}
export interface WorkspaceWindowActions {
  busy(): boolean;
  create(): void;
  open(): Promise<void>;
  settings(category?: string): Promise<void>;
  leftCollapsed(): boolean;
  toggleLeft(): void;
  rightCollapsed(): boolean;
  toggleRight(): void;
  canToggleRight(): boolean;
  escape(): void;
}
export const windowFrameMenusKey: InjectionKey<
  Ref<WorkspaceWindowActions | null>
> = Symbol("window-frame-menus");
