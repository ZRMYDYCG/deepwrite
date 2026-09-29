import type { TestProject } from "vitest/node";
import { messages } from "../apps/desktop/src/renderer/src/i18n/messages";

export default function setup(project: TestProject): void {
  project.provide("i18nMessages", messages);
}
