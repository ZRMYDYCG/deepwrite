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

export async function assertOutsideInstallationDirectory(
  target: string,
  installDirectory: string,
  label: string
): Promise<void> {
  const installation = await realpath(installDirectory);
  if (contains(installation, target) || contains(target, installation)) {
    throw new Error(
      `${label}不能与应用安装目录相同或互相包含，请选择独立文件夹。`
    );
  }
}
