import { writeFile } from "node:fs/promises";
import { repairConversationStorage } from "../src/utilities/conversation-storage/offline-repair";

const [, , userDataPath, mode, resultPath] = process.argv;
if (!userDataPath || !resultPath || (mode !== "repair" && mode !== "reset"))
  throw new Error("Expected: user data folder, repair/reset, result file.");
const result = await repairConversationStorage(userDataPath, mode === "reset");
await writeFile(resultPath, `${JSON.stringify(result)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.status === "failed" ? 1 : 0;
