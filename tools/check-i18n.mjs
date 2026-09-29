import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";

const root = resolve("apps/desktop/src/renderer/src");
const requireDesktop = createRequire(resolve("apps/desktop/package.json"));
const { parse } = requireDesktop("vue/compiler-sfc");
const displayAttributes = new Set([
  "title",
  "placeholder",
  "aria-label",
  "accessible-label",
  "alt",
  "label",
  "description",
  "empty-text",
  "confirm-label",
  "cancel-label"
]);
const hasChinese = /\p{Script=Han}/u;
const violations = [];

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collect(path);
      return entry.name.endsWith(".vue") ||
        entry.name.endsWith(".template.html")
        ? [path]
        : [];
    })
  );
  return groups.flat();
}

function inspect(node, file) {
  if (node.type === 2 && hasChinese.test(node.content)) {
    violations.push(
      `${file}:${node.loc.start.line}: untranslated template text`
    );
  }
  for (const attribute of node.props ?? []) {
    if (
      attribute.type === 6 &&
      displayAttributes.has(attribute.name) &&
      attribute.value &&
      hasChinese.test(attribute.value.content)
    ) {
      violations.push(
        `${file}:${attribute.loc.start.line}: untranslated ${attribute.name}`
      );
    }
  }
  for (const child of node.children ?? []) inspect(child, file);
}

for (const path of await collect(root)) {
  const contents = await readFile(path, "utf8");
  const source = path.endsWith(".template.html")
    ? `<template>${contents}</template>`
    : contents;
  const file = relative(process.cwd(), path);
  const { descriptor, errors } = parse(source, { filename: path });
  if (errors.length) {
    violations.push(`${file}: template parse failed`);
    continue;
  }
  if (descriptor.template?.ast) inspect(descriptor.template.ast, file);
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    "Interface localization check passed: template text and display attributes use language resources."
  );
}
