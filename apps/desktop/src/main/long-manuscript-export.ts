import { nativeText } from "./native-i18n";
import type { BrowserWindow } from "electron";
import { dialog } from "electron";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ExportLongManuscriptInputSchema,
  ExportLongManuscriptResultSchema,
  type ExportLongManuscriptInput,
  type ExportLongManuscriptResult
} from "@deepwrite/contracts";

const WINDOWS_RESERVED_NAMES =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

export function safeLongExportName(label: string, fallback = "未命名"): string {
  const safe = Array.from(
    label
      .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .replace(/[. ]+$/gu, "")
  )
    .slice(0, 120)
    .join("");
  if (!safe || WINDOWS_RESERVED_NAMES.test(safe)) return fallback;
  return safe;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function uniquePath(path: string, extension = ""): Promise<string> {
  if (!(await pathExists(`${path}${extension}`))) return `${path}${extension}`;
  for (let index = 2; index < 100_000; index += 1) {
    const candidate = `${path} (${index})${extension}`;
    if (!(await pathExists(candidate))) return candidate;
  }
  throw new Error("导出目录中存在过多同名文件，请更换导出位置。");
}

export async function writeLongManuscriptExport(
  parentDirectory: string,
  rawInput: ExportLongManuscriptInput
): Promise<{ directoryPath: string; fileCount: number }> {
  const input = ExportLongManuscriptInputSchema.parse(rawInput);
  const directoryBase = join(
    parentDirectory,
    `${safeLongExportName(input.title, "长篇")}-导出`
  );
  const directoryPath = await uniquePath(directoryBase);
  await mkdir(directoryPath, { recursive: false });

  const usedRelativePaths = new Set<string>();
  for (const file of input.files) {
    const directories = file.path
      .slice(0, -1)
      .map((segment) => safeLongExportName(segment));
    const filename = safeLongExportName(file.path.at(-1) ?? "未命名");
    const parentPath = join(directoryPath, ...directories);
    await mkdir(parentPath, { recursive: true });

    const relativeBase = join(...directories, filename).toLocaleLowerCase();
    let suffix = 1;
    let relativeKey = `${relativeBase}.txt`;
    while (usedRelativePaths.has(relativeKey)) {
      suffix += 1;
      relativeKey = `${relativeBase} (${suffix}).txt`;
    }
    usedRelativePaths.add(relativeKey);
    const targetBase = join(
      parentPath,
      suffix === 1 ? filename : `${filename} (${suffix})`
    );
    await writeFile(`${targetBase}.txt`, `\ufeff${file.content}`, "utf8");
  }

  return { directoryPath, fileCount: input.files.length };
}

export async function exportLongManuscript(
  window: BrowserWindow,
  rawInput: ExportLongManuscriptInput
): Promise<ExportLongManuscriptResult> {
  const input = ExportLongManuscriptInputSchema.parse(rawInput);
  const selection = await dialog.showOpenDialog(window, {
    title: nativeText("chooseLongExport"),
    buttonLabel: nativeText("exportHere"),
    properties: ["openDirectory", "createDirectory"]
  });
  const parentDirectory = selection.filePaths[0];
  if (selection.canceled || !parentDirectory) {
    return ExportLongManuscriptResultSchema.parse({ status: "cancelled" });
  }
  return ExportLongManuscriptResultSchema.parse({
    status: "saved",
    ...(await writeLongManuscriptExport(parentDirectory, input))
  });
}
