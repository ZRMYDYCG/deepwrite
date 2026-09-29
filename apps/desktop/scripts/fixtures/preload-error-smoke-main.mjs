import assert from "node:assert/strict";
import { app, BrowserWindow, ipcMain } from "electron";

app.setPath("userData", process.env.DEEPWRITE_ERROR_SMOKE_PROFILE);
async function main() {
  let window;
  try {
    await app.whenReady();
    ipcMain.handle("deepwrite:command", (_event, command) => ({
      status: "rejected",
      requestId: command.id,
      error: {
        code: "catalog.conflict",
        message: "original diagnostic",
        details: { expectedRevision: "before", actualRevision: "after" }
      }
    }));
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        preload: process.env.DEEPWRITE_ERROR_SMOKE_PRELOAD
      }
    });
    await window.loadURL("data:text/html,<html></html>");
    const error = await window.webContents.executeJavaScript(`
      window.deepwrite.system.health().then(
        () => { throw new Error("Expected rejection"); },
        error => ({ isError: error instanceof Error, ...error })
      )
    `);
    assert.deepEqual(error, {
      isError: false,
      code: "catalog.conflict",
      message: "original diagnostic",
      details: { expectedRevision: "before", actualRevision: "after" }
    });
    console.log("DEEPWRITE_PRELOAD_ERROR_SMOKE_OK");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    window?.destroy();
    app.exit(process.exitCode ?? 0);
  }
}

void main();
