---
name: windows-macos-test-package
description: 构建并验证 DeepWrite Windows、macOS 测试安装包，按失败阶段诊断和恢复。用于打包、测试包、Win/Mac 包及相关流程修改；版本递增和发布另用 package-patch-release。
---

# DeepWrite 测试安装包

默认只生成本地测试包，保持当前版本。用户要求递增或发布时再读 [package-patch-release](../package-patch-release/SKILL.md)；正式签名、公证、上传发布须有明确授权及所需凭据。

## 选择一个构建批次

先核对两个 `package.json` 的版本、工作区修改和已有产物。记录本轮平台、源码变更及验证结果，避免把同版本旧包当成新包。不要先单独执行 `pnpm verify` 再启动打包，编排器已包含完整验证。

从仓库根目录执行，选择覆盖请求的最小组合：

| 请求目标                    | 命令                       |
| --------------------------- | -------------------------- |
| Mac ARM、Mac Intel、Windows | `pnpm pack:test:desktop`   |
| 两种 Mac 架构               | `pnpm pack:test:mac`       |
| macOS ARM                   | `pnpm pack:test:mac:arm64` |
| macOS Intel                 | `pnpm pack:test:mac:x64`   |
| Windows x64                 | `pnpm pack:test:win`       |
| Linux x64                   | `pnpm pack:test:linux`     |
| 全部（含 Linux）            | `pnpm pack:test`           |

- 三平台请求优先用 `pack:test:desktop`，同一批次完整验证一次，两种 Mac 架构一起构建，再构建 Windows。不要拆成三个各自执行全量验证的命令，也不要额外构建未请求的 Linux。
- 保留 `tools/run-test-package.mjs` 的完整验证、Electron 版本锁定和退出前开发运行时恢复。不要直接调用 electron-builder 绕过检查；并行打包会共享 `out`、`release` 和 Electron 运行时，构建批次应串行执行。
- macOS 原生验收必须在 `assertElectronLaunchAllowed()` 允许的环境执行。已确认是 Codex Seatbelt 时，直接为具体组合命令申请沙盒外执行；不要先在沙盒内失败一次，不隐藏沙盒状态，也不用 `--no-sandbox` 绕过检测。
- 使用 `apps/desktop/electron-builder.yml`，产物放 `apps/desktop/release/`，保留版本、平台和架构文件名。Mac 在 macOS 构建；Apple Silicon 运行 Intel 包需 Rosetta。Windows 跨平台构建时如实注明目标平台运行验证限制。
- Mac 完整 `.app` 保持 `identity: "-"`、`hardenedRuntime: false`、`notarize: false`；Windows 测试包允许不签名。运行时依赖继续由 electron-vite 编译到 `out`，保留 before-build 钩子。

## 按失败阶段恢复

打包授权包含修复直接阻塞的问题。先读具体错误和 [卡顿与超时诊断](references/troubleshooting.md)，最小修复、确认失败步骤通过后继续。保留用户已有修改，不降低断言或跳过必要检查。

| 失败阶段 / 本轮变化                                   | 恢复方式                                                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 格式、类型、边界或测试失败                            | 先运行相关检查或失败测试文件；确认修复后，再启动一个完整打包批次。不要每改一个超时就重跑全部平台。                                  |
| 安装包冒烟失败，包内容和构建输入未变                  | 用下方验收命令只重跑对应架构，不重新执行全量测试和构建。必须有日志或环境诊断支持重试。                                              |
| 仅修改外部验收脚本                                    | 验证脚本后复验现有包；Main 内的 `smoke*.ts` 是包内容，改动后必须重新构建。                                                          |
| 修改 Main、Preload、Renderer、Utility、契约或构建输入 | 旧包失效；经相关检查后重新走编排器，更新所有受影响的请求产物。                                                                      |
| 构建、签名或下载失败                                  | 先定位配置、缓存、网络或目标环境，再走编排器重建所需目标。当前入口没有构建续跑或验证缓存参数，不臆造 `--resume` / `--skip-verify`。 |

仅复验已有 Mac Intel 包的示例（ARM 改为 `arm64`）：

```sh
pnpm --dir apps/desktop exec node scripts/verify-test-package.mjs mac x64
```

单独验收或中断后，执行 `pnpm electron:ensure`，记录恢复结果。正常打包已自动执行后置检查，无需重复。重新验证不能替代源码变化后的重建；复用包须确认它来自本轮成功构建，版本和输入未变。

同一失败没有新诊断依据时，不反复重跑整条流水线。确实缺少目标环境、凭据或授权时，完成不受阻塞的目标并报告剩余步骤；未通过验证的包不能报为成功或发布。重试沿用本轮版本，不再次递增，只清理明确的失败生成物。单架构重建后核对完整 Mac 清单，避免丢失另一架构引用。

## 观察执行进度

- 跟踪 `PACKAGE_STEP`、测试总结、builder 进度和 `PACKAGE_*_OK` 标记。开始等待前说明当前阶段；更新应包含新阶段、已确认结果或新的诊断，不连续发送“仍在等待”。
- 工具等待采用约 30 秒一次的有界等待。长时间无输出先检查当前子进程、CPU、经过时间及测试已有超时，不能把静默直接判断为卡死，也不能依据 CPU 活动宣称测试已通过。
- 已确认本轮失败且需要重跑时，可结束该轮测试子进程，让编排器完成运行时恢复；核对其子进程已退出再重启。不要误杀用户开发应用，或直接杀掉编排器导致 `finally` 不执行。具体判断见诊断参考。

## 验收与交付

- `verify-test-package.mjs` 检查安装包非空及包内运行时完整；可运行的目标完成首次启动和重新打开冒烟，覆盖 Main、Renderer、Preload、Core / Agent / Tool Utility。`PACKAGE_SMOKE_SKIPPED` 表示未完成运行验证。
- Mac 同时通过 DMG 校验、`codesign --verify --deep --strict`、顶层 `Signature=adhoc` 和挂载后包内应用验证；ZIP 也检查压缩完整性。仅清除本轮 DMG 意外残留的隔离属性。
- 核对请求目标的文件名、版本、大小、生成时间及 `latest*.yml` 的引用和 SHA-512；两种 Mac 架构清单应完整保留。开发运行时恢复必须通过，但它不等于开发桌面已启动。
- 简洁报告版本、产物链接、验证结果及必要修复；跨平台包写明“只完成构建和完整性检查，未完成目标平台运行验证”。Mac ad-hoc 签名不等于 Developer ID 或公证，不承诺下载后无提示打开。
