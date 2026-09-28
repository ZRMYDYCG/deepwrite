import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");

const LISTED_ORIGINALS = {
  "apps/desktop/src/utilities/long-project-store.ts": 2000,
  "apps/desktop/src/utilities/folder-catalog-store.ts": 2000,
  "apps/desktop/src/renderer/src/components/LongWorkspaceEditor.vue": 2000,
  "apps/desktop/src/renderer/src/styles.css": 2000,
  "apps/desktop/src/renderer/src/composables/useProposalCoordinator.ts": 2000,
  "packages/contracts/src/long-workspace-operations.ts": 2000,
  "apps/desktop/src/renderer/src/composables/useAgentConversation.ts": 2000,
  "packages/contracts/src/long-workspace.ts": 2000,
  "apps/desktop/src/main/index.ts": 2000,
  "packages/pi-runtime-adapter/src/index.ts": 2000,
  "packages/pi-runtime-adapter/src/long-agent-tools/setting-tools.ts": 2000,
  "apps/desktop/src/renderer/src/components/AgentConversation.vue": 2000,
  "apps/desktop/src/renderer/src/composables/useLongStructureTransactionsCoordinator.ts": 2000,
  "packages/pi-runtime-adapter/src/short-agent-tools.ts": 2000,
  "apps/desktop/src/preload/index.ts": 2000,
  "packages/contracts/src/session.ts": 2000,
  "packages/contracts/src/catalog.ts": 2000,
  "apps/desktop/src/utilities/write-claw-long-import.ts": 2000,
  "apps/desktop/src/renderer/src/components/LongForeshadowingWorkspace.vue": 2000,
  "apps/desktop/src/renderer/src/WorkspaceShell.vue": 2850
};

const DECLARED_EXCEPTIONS = {
  "apps/desktop/src/renderer/src/WorkspaceShell.vue": 2850,
  "apps/desktop/src/renderer/src/components/LongWorkspaceEditor.vue": 3689
};

const IN_PROGRESS_ALLOWLIST = [];

const NEW_MODULE_DIRECTORIES = [
  "packages/contracts/src/long-workspace",
  "packages/contracts/src/catalog",
  "packages/contracts/src/long-workspace-operations",
  "packages/contracts/src/session",
  "apps/desktop/src/utilities/long-project-store",
  "apps/desktop/src/utilities/folder-catalog-store",
  "apps/desktop/src/utilities/write-claw-long-import",
  "apps/desktop/src/renderer/src/styles",
  "apps/desktop/src/renderer/src/composables/proposal-coordinator",
  "apps/desktop/src/renderer/src/composables/agent-conversation",
  "apps/desktop/src/renderer/src/composables/long-structure-transactions",
  "apps/desktop/src/main/ipc",
  "packages/pi-runtime-adapter/src/short-agent-tools"
];

const NEW_MODULE_FILES = [
  "packages/pi-runtime-adapter/src/runtime-types.ts",
  "packages/pi-runtime-adapter/src/tool-stream.ts",
  "packages/pi-runtime-adapter/src/evaluation.ts",
  "packages/pi-runtime-adapter/src/provider-runtime.ts",
  "packages/pi-runtime-adapter/src/event-mapping.ts",
  "packages/pi-runtime-adapter/src/subagent-events.ts",
  "packages/pi-runtime-adapter/src/prompts.ts",
  "packages/pi-runtime-adapter/src/faux-local.ts",
  "packages/pi-runtime-adapter/src/adapter.ts",
  "packages/pi-runtime-adapter/src/long-agent-tools/setting-worldbuilding-tools.ts",
  "packages/pi-runtime-adapter/src/long-agent-tools/setting-character-tools.ts",
  "packages/pi-runtime-adapter/src/long-agent-tools/setting-alias-tools.ts",
  "apps/desktop/src/extras/agents/chat/runtime-snapshot.ts",
  "apps/desktop/src/main/usage-observation.ts",
  "apps/desktop/src/preload/invoke.ts",
  "apps/desktop/src/preload/catalog-api.ts",
  "apps/desktop/src/preload/long-api.ts",
  "apps/desktop/src/preload/session-models-api.ts",
  "apps/desktop/src/preload/settings-api.ts",
  "apps/desktop/src/preload/extras-api.ts",
  "apps/desktop/src/renderer/src/composables/useLongEditorPaneResize.ts",
  "apps/desktop/src/renderer/src/composables/useLongEditorRecovery.ts",
  "apps/desktop/src/renderer/src/composables/useLongEditorDocumentSession.ts",
  "apps/desktop/src/renderer/src/composables/useLongEditorHistory.ts",
  "apps/desktop/src/renderer/src/composables/useLongEditorStructureSelection.ts",
  "apps/desktop/src/renderer/src/composables/useLongEditorFindReplace.ts",
  "apps/desktop/src/renderer/src/composables/useLongEditorDeleteDialogs.ts",
  "apps/desktop/src/renderer/src/composables/useForeshadowingFilters.ts",
  "apps/desktop/src/renderer/src/composables/useForeshadowingMutations.ts",
  "apps/desktop/src/renderer/src/composables/useConversationScrollFollow.ts",
  "apps/desktop/src/renderer/src/composables/useConversationAttachments.ts",
  "apps/desktop/src/renderer/src/composables/useConversationComposer.ts",
  "apps/desktop/src/renderer/src/components/LongEditorFindReplaceBar.vue",
  "apps/desktop/src/renderer/src/components/LongEditorDeleteDialogs.vue",
  "apps/desktop/src/renderer/src/components/ForeshadowingFilterBar.vue",
  "apps/desktop/src/renderer/src/components/ForeshadowingEditorDialog.vue",
  "apps/desktop/src/renderer/src/components/ForeshadowingDeleteDialog.vue",
  "apps/desktop/src/renderer/src/components/ConversationComposer.vue",
  "apps/desktop/src/renderer/src/components/ConversationMessageList.vue",
  "apps/desktop/src/renderer/src/components/conversationToolPresentation.ts"
];

const SOURCE_EXTENSIONS = new Set([".ts", ".vue", ".css", ".mjs"]);
const TEST_PATTERN = /\.test(?:-support)?\./;
const NEW_FILE_BUDGET = 1500;
const TEST_FILE_BUDGET = 1500;

function posixPath(filePath) {
  return filePath.split("\\").join("/");
}

function countLines(source) {
  if (source.length === 0) return 0;
  const newlines = source.match(/\n/g);
  const newlineCount = newlines ? newlines.length : 0;
  return source.endsWith("\n") ? newlineCount : newlineCount + 1;
}

function isTestFile(relPath) {
  return TEST_PATTERN.test(relPath) || relPath.includes("/__tests__/");
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === "out" ||
      entry.name === "release"
    ) {
      continue;
    }
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function isUnderNewModuleDirectory(relPath) {
  return NEW_MODULE_DIRECTORIES.some(
    (directory) => relPath === directory || relPath.startsWith(`${directory}/`)
  );
}

const allowlist = new Set(IN_PROGRESS_ALLOWLIST);
const listedBudget = new Map(Object.entries(LISTED_ORIGINALS));
const exceptionBudget = new Map(Object.entries(DECLARED_EXCEPTIONS));
const newModuleFiles = new Set(NEW_MODULE_FILES);

const scanRoots = [
  resolve(repoRoot, "apps/desktop/src"),
  resolve(repoRoot, "packages")
];

const files = [];
for (const root of scanRoots) {
  files.push(...(await collectFiles(root)));
}

const violations = [];
const reports = [];

for (const file of files.sort()) {
  const relPath = posixPath(relative(repoRoot, file));
  const source = await readFile(file, "utf8");
  const lines = countLines(source);

  if (isTestFile(relPath)) {
    reports.push({ relPath, lines, budget: TEST_FILE_BUDGET, kind: "test" });
    if (lines > TEST_FILE_BUDGET) {
      violations.push(
        `${relPath} has ${lines} lines (test source budget ${TEST_FILE_BUDGET})`
      );
    }
    continue;
  }

  if (listedBudget.has(relPath)) {
    const budget = exceptionBudget.get(relPath) ?? listedBudget.get(relPath);
    reports.push({ relPath, lines, budget, kind: "listed" });
    if (allowlist.has(relPath)) continue;
    if (lines > budget) {
      violations.push(
        `${relPath} has ${lines} lines (budget ${budget}${exceptionBudget.has(relPath) ? ", declared exception" : ""})`
      );
    }
    continue;
  }

  if (isUnderNewModuleDirectory(relPath) || newModuleFiles.has(relPath)) {
    reports.push({
      relPath,
      lines,
      budget: NEW_FILE_BUDGET,
      kind: "new-module"
    });
    if (lines > NEW_FILE_BUDGET) {
      violations.push(
        `${relPath} has ${lines} lines (new non-test source budget ${NEW_FILE_BUDGET})`
      );
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

const allowlistNote =
  allowlist.size === 0
    ? "in-progress allowlist empty"
    : `in-progress allowlist ${allowlist.size} path(s)`;
const exceptionNote = [...exceptionBudget.entries()]
  .map(([path, budget]) => `${path}<=${budget}`)
  .join(", ");

console.log(
  `Source line-budget check passed: tests <= ${TEST_FILE_BUDGET}; listed originals within budget (${allowlistNote}; declared exceptions: ${exceptionNote || "none"}); new non-test split modules <= ${NEW_FILE_BUDGET}.`
);
