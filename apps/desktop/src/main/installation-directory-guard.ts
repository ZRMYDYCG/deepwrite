import { realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep
} from "node:path";

export function installationDirectory(executablePath: string): string {
  let directory = dirname(resolve(executablePath));
  if (process.platform === "darwin") {
    while (dirname(directory) !== directory) {
      if (basename(directory).endsWith(".app")) return directory;
      directory = dirname(directory);
    }
  }
  return dirname(resolve(executablePath));
}

function contains(parent: string, child: string): boolean {
  const offset = relative(parent, child);
  return (
    offset === "" ||
    (!offset.startsWith(`..${sep}`) && offset !== ".." && !isAbsolute(offset))
  );
}

async function canonical(path: string): Promise<string> {
  return realpath(path).catch(() => resolve(path));
}

/**
 * True when `target` is the installation directory, lies at any depth beneath
 * it, or contains it. Uninstalling or updating wipes the installation
 * directory, so user data may never share that tree in either direction.
 */
export async function overlapsInstallationDirectory(
  target: string,
  installDirectory: string
): Promise<boolean> {
  const [installation, resolved] = await Promise.all([
    canonical(installDirectory),
    canonical(target)
  ]);
  return contains(installation, resolved) || contains(resolved, installation);
}

export async function assertOutsideInstallationDirectory(
  target: string,
  installDirectory: string,
  label: string
): Promise<void> {
  if (await overlapsInstallationDirectory(target, installDirectory)) {
    throw new Error(
      `${label}不能与应用安装目录相同、位于安装目录的任意层级子目录内，也不能包含安装目录，请选择独立文件夹。`
    );
  }
}
