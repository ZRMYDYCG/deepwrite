import type { BrowserWindow } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  BookIdentityResolveCoverAssetResultSchema,
  CommandEnvelopeSchema,
  createEnvelope
} from "@deepwrite/contracts";
import type { UtilitySupervisor } from "./supervisor";
import { identitySmokeInRenderer } from "./smoke-book-identity-renderer";
import { prepareIdentitySmokeInRenderer } from "./smoke-book-identity-prepare";
import { createIdentitySmokeUi } from "./smoke-book-identity-ui";
import {
  checkIdentityAdoption,
  observeIdentityAdoption
} from "./smoke-book-identity-adoption";
import { runIdentityVisualSmoke } from "./smoke-book-identity-visual";

export async function runBookIdentitySmoke(
  window: BrowserWindow,
  supervisor: UtilitySupervisor
) {
  if (
    process.env.DEEPWRITE_SMOKE !== "1" ||
    process.env.DEEPWRITE_APP_MODE !== "evaluation"
  )
    throw new Error(
      "Book identity smoke requires an isolated evaluation build."
    );
  window.showInactive();
  window.webContents.setBackgroundThrottling(false);
  let result: Awaited<ReturnType<typeof identitySmokeInRenderer>>;
  try {
    const book = await window.webContents.executeJavaScript(
      `(${prepareIdentitySmokeInRenderer.toString()})()`
    );
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Book identity fixture reload timed out.")),
        8_000
      );
      window.webContents.once("did-finish-load", () => {
        clearTimeout(timeout);
        resolve();
      });
      window.webContents.reload();
    });
    result = await window.webContents.executeJavaScript(
      `(${identitySmokeInRenderer.toString()})(${createIdentitySmokeUi.toString()},${observeIdentityAdoption.toString()},${checkIdentityAdoption.toString()},${JSON.stringify(book)})`
    );
  } catch (error) {
    const screenshot = join(tmpdir(), "deepwrite-identity-ui-failure.png");
    await writeFile(screenshot, (await window.capturePage()).toPNG());
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; screenshot=${screenshot}`
    );
  }
  const command = CommandEnvelopeSchema.parse(
    createEnvelope(
      "bookIdentity.resolveCoverAsset",
      { book: result.book, file: "cover.png" },
      {
        id: "identity_smoke_resolve",
        context: {
          correlationId: "identity_smoke_resolve",
          resourceId: result.book.projectId
        }
      }
    )
  );
  const resolved = await supervisor.requestCommand("core", command);
  if (resolved.status !== "accepted") throw new Error(resolved.error.message);
  const asset = BookIdentityResolveCoverAssetResultSchema.parse(
    resolved.payload
  );
  const directory = dirname(asset.path);
  const record = JSON.parse(
    await readFile(join(directory, "identity.json"), "utf8")
  );
  if (
    record.bookId !== result.book.projectId ||
    record.revision !== result.revision ||
    !asset.path.endsWith("/book-identity/cover.png")
  )
    throw new Error(
      "Identity files were not persisted in the registered project."
    );
  for (const file of [result.imageFile, result.thumbFile, result.composedFile])
    if (!(await readFile(join(directory, file))).length)
      throw new Error("Missing persisted cover asset.");
  const visuals = await runIdentityVisualSmoke(window, result.book);
  const finalRecord = JSON.parse(
    await readFile(join(directory, "identity.json"), "utf8")
  );
  if (finalRecord.revision !== visuals.adoptionChecks.at(-1)?.revision)
    throw new Error("Visual adoption checks were not persisted.");
  return {
    ...result,
    revision: finalRecord.revision,
    persisted: true,
    visuals
  };
}
