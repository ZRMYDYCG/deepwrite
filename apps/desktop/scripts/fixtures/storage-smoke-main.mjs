import { app, net, session } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.DEEPWRITE_STORAGE_SMOKE_ROOT;
const entry = process.env.DEEPWRITE_STORAGE_SMOKE_ENTRY;
if (!root || !entry) throw new Error("Missing isolated storage smoke paths.");
app.setPath("userData", join(root, "default"));
app.setPath("sessionData", join(root, "default"));
app.setPath("home", join(root, "home"));
app.setPath("documents", join(root, "documents"));
app.setPath("appData", join(root, "app-data"));
process.env.DEEPWRITE_LEGACY_PROJECT_DATA_ROOT = join(root, "legacy");

// Test data has no live endpoints or credentials; forbid accidental refreshes.
const offline = async () => {
  throw new Error("Network is disabled for storage smoke.");
};
globalThis.fetch = offline;
net.fetch = offline;
app.once("ready", () => {
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*"] },
    (_details, callback) => callback({ cancel: true })
  );
});
await import(pathToFileURL(entry).href);
