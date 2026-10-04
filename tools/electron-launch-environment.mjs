export function assertElectronLaunchAllowed({
  platform = process.platform,
  env = process.env
} = {}) {
  if (platform !== "darwin" || env.CODEX_SANDBOX !== "seatbelt") return;

  const error = new Error(
    "[DEEPWRITE_ELECTRON_SANDBOX] macOS 的 Codex 沙盒无法启动 " +
      "Electron 桌面进程：窗口服务和 " +
      "LaunchServices 访问会被拒绝。请从系统终端运行此命令，或为此命令" +
      "申请沙盒外执行；不要在沙盒内反复重试。Electron 的 --no-sandbox " +
      "参数不会解除 Codex 的系统沙盒限制。"
  );
  error.code = "DEEPWRITE_ELECTRON_SANDBOX";
  throw error;
}
