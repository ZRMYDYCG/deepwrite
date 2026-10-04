import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertElectronLaunchAllowed } from "./electron-launch-environment.mjs";

assertElectronLaunchAllowed();

const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("electron-vite")), "cli.js");
process.argv = [process.execPath, cli, "preview", ...process.argv.slice(2)];
await import(pathToFileURL(cli).href);
