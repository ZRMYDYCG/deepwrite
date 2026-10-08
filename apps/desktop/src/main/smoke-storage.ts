import { app, type BrowserWindow } from "electron";
import { join, relative } from "node:path";
import type { DeepWriteApi } from "@deepwrite/contracts";
import { ModelConfigStore } from "./model-config-store";
import { runStorageUiSmoke } from "./smoke-storage-ui";
import { legacyHistorySmokeInRenderer } from "./smoke-storage-history";

type StorageSmokePhase = "seed" | "custom" | "reopened" | "restored";

/** This function is serialized so all assertions use the real sandboxed Preload. */
async function storageSmokeInRenderer(input: {
  phase: StorageSmokePhase;
  defaultPath: string;
  currentPath: string;
  defaultWorkspace: string;
  customWorkspace: string;
}) {
  const api = (globalThis as unknown as { deepwrite: DeepWriteApi }).deepwrite;
  const storage = api.storageSettings;
  const persistence = api.conversationPersistence;
  if (!storage || !persistence) throw new Error("Storage APIs are missing.");
  const ensure = (condition: unknown, message: string) => {
    if (!condition) throw new Error(`Storage smoke: ${message}`);
  };
  const snapshot = await storage.get();
  ensure(snapshot.userData.path === input.currentPath, "current path differs");
  ensure(
    snapshot.userData.defaultPath === input.defaultPath &&
      snapshot.userData.isDefault === (input.currentPath === input.defaultPath),
    "default path or location status differs"
  );
  ensure(
    snapshot.workspace.defaultPath === input.defaultWorkspace &&
      (await api.workspaceDirectory.list()).path === snapshot.workspace.path,
    "workspace entry is not shared"
  );

  const identity = {
    key: "conversation-history:storage-smoke",
    sessionId: "storage_smoke_session"
  };
  const preferenceKey = "conversation-preferences:storage-smoke";
  const browserKey = "deepwrite.storage-smoke.layout";
  const marker = ["reopened", "restored"].includes(input.phase)
    ? "custom"
    : "seed";
  const history = persistence.history;
  if (!history) throw new Error("Conversation history API is missing.");

  if (input.phase === "seed") {
    ensure(!snapshot.workspace.isDefault, "custom workspace was lost");
    ensure(
      snapshot.workspace.path === input.customWorkspace,
      "custom workspace path differs"
    );
    await api.models.save({
      models: [
        {
          id: "storage_smoke_model",
          label: "Storage seed model",
          provider: "storage-smoke",
          modelId: "storage-smoke-model",
          api: "openai-completions",
          baseUrl: "https://storage.example.test/v1",
          reasoning: false,
          defaultThinkingLevel: "off",
          thinkingLevelOptions: ["low", "medium", "high"],
          temperatureOptions: [0.1, 0.7, 1],
          apiKey: "invalid-storage-smoke-placeholder"
        }
      ],
      defaultModelId: "storage_smoke_model"
    });
    await history.commit({
      ...identity,
      expectedRevision: 0,
      generation: 0,
      sequence: 1,
      batchId: "seed",
      operations: [
        {
          type: "setMetadata",
          value: { draft: "seed", createdAt: "2026-01-01T00:00:00.000Z" }
        },
        {
          type: "putMessage",
          messageId: "storage_smoke_message",
          position: 0,
          value: { role: "user", content: "storage smoke history" }
        },
        { type: "setActive", sessionId: identity.sessionId }
      ]
    });
    await persistence.save(preferenceKey, { layout: "seed" });
    localStorage.setItem(browserKey, "seed");
    const settings = (await api.generalSettings.list()).settings;
    await api.generalSettings.save({ ...settings, showContextUsage: false });
    const book = await api.catalog.createShortBook({
      title: "Storage smoke book",
      genre: "其他"
    });
    if (!book?.documents[0]) throw new Error("Smoke book creation failed.");
    await api.catalog.saveDocument({
      bookId: book.id,
      documentId: book.documents[0].id,
      content: "Existing work stays in its original workspace."
    });
    ensure(
      await api.long.create({ title: "Storage seed long book", genre: "其他" }),
      "long book creation failed"
    );
  }

  const models = await api.models.list();
  const model = models.models.find((item) => item.id === "storage_smoke_model");
  ensure(
    model?.label === `Storage ${marker} model` &&
      model.hasApiKey &&
      models.defaultModelId === model.id,
    "model configuration or key did not survive"
  );
  ensure(
    !JSON.stringify(models).includes("invalid-storage-smoke-placeholder"),
    "encrypted credential was exposed"
  );
  const state = await history.session(identity);
  ensure(state?.metadata.draft === marker, "history draft differs");
  const messages = await history.messages(identity);
  ensure(
    messages.messages[0]?.value.content === "storage smoke history",
    "history message differs"
  );
  ensure(
    JSON.stringify(await persistence.load(preferenceKey)) ===
      JSON.stringify({ layout: marker }) &&
      localStorage.getItem(browserKey) === marker,
    "Core preferences or Chromium local storage differs"
  );
  ensure(
    !(await api.generalSettings.list()).settings.showContextUsage,
    "general settings were reset"
  );
  const book = (await api.catalog.snapshot()).books.find(
    (item) => item.title === "Storage smoke book"
  );
  ensure(
    book?.documents[0]?.content ===
      "Existing work stays in its original workspace.",
    "existing workspace book was moved or lost"
  );
  const long = (await api.long.list()).books.find(
    (item) => item.title === `Storage ${marker} long book`
  );
  if (!long) throw new Error("Storage smoke: registered long book was lost");
  ensure(
    (await api.long.open({ bookId: long.id })).book.title === long.title,
    "registered long book cannot be reopened"
  );

  if (input.phase === "custom") {
    if (!model || !state) throw new Error("Missing persisted smoke state.");
    const { hasApiKey: _hasKey, ...modelInput } = model;
    await api.models.save({
      models: [{ ...modelInput, label: "Storage custom model" }],
      defaultModelId: model.id
    });
    await history.commit({
      ...identity,
      expectedRevision: state.revision,
      generation: state.generation,
      sequence: state.sequence + 1,
      batchId: "custom",
      operations: [{ type: "setMetadata", value: { draft: "custom" } }]
    });
    await persistence.save(preferenceKey, { layout: "custom" });
    localStorage.setItem(browserKey, "custom");
    ensure(
      (
        await api.long.rename({
          bookId: long.id,
          title: "Storage custom long book"
        })
      ).book.title === "Storage custom long book",
      "migrated long registry cannot be updated"
    );
  }
  return {
    phase: input.phase,
    status: "ok",
    paths: true,
    models: true,
    history: true,
    preferences: true,
    chromiumStorage: true,
    workspacePreserved: true,
    longProjects: true
  };
}

export async function runStorageSmoke(window: BrowserWindow) {
  const root = process.env.DEEPWRITE_STORAGE_SMOKE_ROOT;
  const phase = process.env.DEEPWRITE_STORAGE_SMOKE;
  if (
    !root ||
    !["seed", "custom", "reopened", "restored"].includes(phase ?? "")
  ) {
    throw new Error("Missing isolated storage smoke configuration.");
  }
  const currentPath = join(
    root,
    phase === "custom" || phase === "reopened" ? "custom" : "default"
  );
  if (relative(currentPath, app.getPath("userData")) !== "") {
    throw new Error("Storage smoke refused a profile outside its fixture.");
  }
  const result = await window.webContents.executeJavaScript(
    `(${storageSmokeInRenderer.toString()})(${JSON.stringify({
      phase,
      defaultPath: join(root, "default"),
      currentPath,
      defaultWorkspace: join(root, "documents", "DeepWriteBooks"),
      customWorkspace: join(root, "workspace-custom")
    })})`
  );
  const model = await new ModelConfigStore(currentPath).resolve(
    "storage_smoke_model"
  );
  if (model?.apiKey !== "invalid-storage-smoke-placeholder") {
    throw new Error("Migrated model credential could not be decrypted.");
  }
  const ui = phase === "seed" ? await runStorageUiSmoke(window) : undefined;
  const legacyHistory = await window.webContents.executeJavaScript(
    `(${legacyHistorySmokeInRenderer.toString()})(${JSON.stringify(phase)})`
  );
  window.webContents.session.flushStorageData();
  return {
    ...result,
    legacyHistory,
    encryptedCredential: true,
    ...(ui ? { ui } : {})
  };
}
