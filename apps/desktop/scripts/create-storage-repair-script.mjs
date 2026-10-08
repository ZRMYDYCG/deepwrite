import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const scripts = dirname(fileURLToPath(import.meta.url));
const profile = process.argv[2];
if (!profile || !/^[A-Za-z]:[\\/]/u.test(profile) || /[\r\n\0]/u.test(profile))
  throw new Error("Provide the Windows user data folder as the only argument.");
const output = resolve(scripts, "../release/storage-repair");
const temporary = await mkdtemp(join(tmpdir(), "deepwrite-repair-build-"));
try {
  await build({
    configFile: false,
    logLevel: "silent",
    build: {
      ssr: join(scripts, "repair-conversation-storage-entry.ts"),
      outDir: temporary,
      rollupOptions: { output: { entryFileNames: "repair.mjs" } },
      minify: false
    },
    ssr: { noExternal: true }
  });
  const bundle = await readFile(join(temporary, "repair.mjs"));
  const template = await readFile(
    join(scripts, "repair-conversation-storage.ps1"),
    "utf8"
  );
  const script = template
    .replace("__USER_DATA_PATH__", () => profile.replaceAll("'", "''"))
    .replace("__REPAIR_PAYLOAD_BASE64__", bundle.toString("base64"));
  await mkdir(output, { recursive: true });
  const path = join(output, "DeepWrite-Repair-History.ps1");
  await writeFile(path, `\uFEFF${script}`, "utf8");
  const launcher =
    '@echo off\r\nchcp 65001 >nul\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0DeepWrite-Repair-History.ps1"\r\npause\r\n';
  await writeFile(join(output, "Run-Repair.cmd"), launcher, "utf8");
  await writeFile(
    join(output, "使用说明.txt"),
    `DeepWrite Windows 会话存储修复\r\n\r\n目标用户数据目录：${profile}\r\n\r\n1. 完全退出 DeepWrite，包括任务栏托盘里的程序。\r\n2. 解压全部文件到任意文件夹。\r\n3. 双击 Run-Repair.cmd，等待脚本完成。\r\n4. 看到“修复已完成”后，重新打开 DeepWrite 验证历史列表和发送消息。\r\n\r\n脚本先复制并校验 renderer-state 整个目录，包含 SQLite、WAL、SHM 和旧 JSON。备份保存在用户数据目录旁，名字以 desktop-conversation-backup- 开头。\r\n默认模式保留历史，使用同一套 Core 迁移代码修复已知目录切换故障。不能安全处理的错误会停止，并输出具体错误码。\r\n运行结果会保存到桌面的 DeepWrite-storage-repair-result.txt。失败时请把结果文件发给开发者；不要删除备份。\r\n\r\n如果没有找到程序，在此文件夹打开 PowerShell，指定 DeepWrite.exe 的安装路径：\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\DeepWrite-Repair-History.ps1 -AppPath "C:\\实际安装目录\\DeepWrite.exe"\r\n\r\n仅当你决定先恢复新会话功能、允许应用中的旧历史列表暂时为空时，才运行以下命令：\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\DeepWrite-Repair-History.ps1 -ResetConversations\r\n这个模式完整备份后隔离旧 renderer-state，建立空的会话存储。旧会话不会出现在当前历史列表中，原文件保存在备份里，待后续恢复。模型配置、密钥、作品和数据目录设置不会被修改。\r\n\r\n本工具没有在这台 Windows 机器上验收。修复完成提示表示本地校验和迁移成功，最终以重新打开软件后的实际行为为准。\r\n`,
    "utf8"
  );
  console.log(path);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
