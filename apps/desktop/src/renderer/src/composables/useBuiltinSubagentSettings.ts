import { formatError } from "../i18n/errors";
import { createScopedTranslator } from "../i18n";
import { ref } from "vue";
import {
  BuiltinSubagentSettingsSchema,
  type BuiltinSubagentSettings
} from "@deepwrite/contracts/renderer";
import { useSettingsStore } from "../stores/settingsStore";
import { uiMessage } from "../ui-feedback";

const t = createScopedTranslator("workspace.builtinSubagentSettings");

export function useBuiltinSubagentSettings() {
  const saving = ref(false);
  const settings = useSettingsStore();
  async function save(input: BuiltinSubagentSettings): Promise<boolean> {
    const api = window.deepwrite;
    if (!api || saving.value || settings.agentTeamSaving) return false;
    const parsed = BuiltinSubagentSettingsSchema.safeParse(input);
    if (!parsed.success) {
      uiMessage.warning(t("enterACallingDescriptionOfUpToCharacters"));
      return false;
    }
    saving.value = true;
    settings.agentTeamSaving = true;
    try {
      settings.markLoaded(
        "agentTeams",
        await api.agentTeams.saveBuiltins(parsed.data)
      );
      uiMessage.success(t("builtInManagementSubagentSettingsSaved"));
      return true;
    } catch (error) {
      uiMessage.error(formatError(error, t("failedToSavePleaseTryAgain")));
      return false;
    } finally {
      saving.value = false;
      settings.agentTeamSaving = false;
    }
  }
  return { saving, save };
}
