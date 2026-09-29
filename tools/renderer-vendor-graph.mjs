import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import ts from "typescript";

const vueChunk = /^vue-runtime-[^/]+\.js$/;
const helperChunk = /^(?:rolldown-runtime|preload-helper)-[^/]+\.js$/;

/** Vendor initialization must never depend on the application's i18n singleton. */
export async function assertRendererVendorGraph(
  runtimePath,
  readSource = (path) => readFile(path, "utf8")
) {
  const visited = new Set();
  let hasVueRuntime = false;
  async function visit(path, kind) {
    if (visited.has(path)) return;
    visited.add(path);
    const source = ts.createSourceFile(
      path,
      await readSource(path),
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.JS
    );
    if (source.parseDiagnostics.length) {
      throw new Error(`Cannot parse Renderer vendor chunk: ${basename(path)}`);
    }
    for (const statement of source.statements) {
      if (
        !ts.isImportDeclaration(statement) &&
        !ts.isExportDeclaration(statement)
      )
        continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      const dependency = specifier.text;
      const name = dependency.slice(2);
      const isVue = kind === "i18n" && vueChunk.test(name);
      if (!dependency.startsWith("./") || (!isVue && !helperChunk.test(name))) {
        throw new Error(
          `Renderer vendor initialization has an unexpected dependency: ${basename(path)} → ${dependency}`
        );
      }
      if (isVue) hasVueRuntime = true;
      await visit(join(dirname(path), dependency), isVue ? "vue" : "helper");
    }
  }
  await visit(runtimePath, "i18n");
  if (!hasVueRuntime) {
    throw new Error(
      "The internationalization runtime must use the isolated Vue runtime."
    );
  }
}
