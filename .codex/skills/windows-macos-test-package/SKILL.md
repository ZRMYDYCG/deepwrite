---
name: windows-macos-test-package
description: 构建并验证 DeepWrite Windows、macOS 测试安装包，排查打包错误、修复后继续。用于打包、测试包、Win/Mac 包及相关流程修改；版本递增和发布另用 package-patch-release。
---

# DeepWrite 测试安装包

默认只生成本地测试包。正式签名、公证或上传发布须有用户明确要求及所需凭据；递增版本或发布时同时读 [package-patch-release](../package-patch-release/SKILL.md)。

## 打包入口

从仓库根目录执行，按用户指定平台选择；未指定使用全部：

| 目标                 | 命令                       |
| -------------------- | -------------------------- |
| 全部（含 Linux x64） | `pnpm pack:test`           |
| Windows x64          | `pnpm pack:test:win`       |
| macOS arm64          | `pnpm pack:test:mac:arm64` |
| macOS x64            | `pnpm pack:test:mac:x64`   |
| 两种 macOS 架构      | `pnpm pack:test:mac`       |
| Linux x64            | `pnpm pack:test:linux`     |

- 保留 `tools/run-test-package.mjs` 编排：完整执行 `pnpm verify`、锁定打包 Electron 版本，并在成功或失败退出前恢复、验证主机开发运行时。不得直接调用 electron-builder 绕过检查或复用不明来源的 `out`。
- 使用 `apps/desktop/electron-builder.yml`，输出到 `apps/desktop/release/`，保留配置生成的版本、平台和架构文件名。Mac 包在 macOS 构建；Apple Silicon 上运行 x64 包需可用的 Rosetta。Windows 优先在 Windows x64 构建，跨平台构建如实标注运行验证限制。
- Mac 完整 `.app` 使用 `identity: "-"`、`hardenedRuntime: false`、`notarize: false`；不得改成 `identity: null`。Windows 测试包允许不签名。
- 运行时依赖由 electron-vite 编译到 `out`，保留 `electron-builder-before-build.cjs` 防止重复安装依赖。修复涉及未打包依赖或原生模块时，同步检查钩子、`files` 和安装包内运行。

## 遇错修复并继续

打包请求包含解决阻塞打包的问题。遇到错误不要只报告后结束：定位失败步骤和根因 → 最小修复 → 运行相关检查 → 重跑对应 `pnpm pack:test:*`，直到请求产物完成并通过验证。

- 类型、格式、边界、测试、构建、签名或冒烟失败，允许修复直接相关的代码、测试、配置及脚本。保留已有修改，只格式化涉及文件，不借机重构、降低断言或跳过检查。
- 下载或网络错误先检查连接、缓存和工具状态，再有限重试；持续失败时换可用的合规路径。每次重试须有修复或新的诊断依据，不反复执行同一失败命令。
- 重试沿用本轮版本，不再次递增；只清理明确的失败生成物。重建多架构包后重新检查完整产物与更新清单，不能让单架构重跑丢失其他架构引用。
- 桌面启动沿用 `assertElectronLaunchAllowed()`。遇到 `DEEPWRITE_ELECTRON_SANDBOX` 为具体打包或验收命令申请沙盒外执行；不在沙盒内重复启动，也不伪造环境或跳过冒烟来取得成功。
- 只有确实缺少授权、凭据、目标环境，或继续会覆盖用户数据、扩大任务范围时才请求所需信息；继续完成不受阻塞的工作，说明剩余步骤。未通过验证的产物不得发布或报为成功。

## 验收与交付

- 用 `apps/desktop/scripts/verify-test-package.mjs` 检查安装包非空、版本及包内运行时完整；目标主机可运行时完成安装包内冒烟，覆盖 Main、Renderer、Preload 和 core / agent / tool Utility。
- Mac 同时通过 DMG 校验、`codesign --verify --deep --strict`、顶层 `Signature=adhoc`；挂载 DMG 后验证包内应用。交付前仅清除本轮 DMG 意外残留的 `com.apple.quarantine`。
- 开发 Electron 恢复验证必须通过，确保后续 `pnpm dev` 仍可启动。受系统限制无法运行目标产物时写明“只完成构建，未完成目标平台运行验证”。
- 简洁报告版本、产物路径、验证结果及必要修复。Mac ad-hoc 签名不等于 Developer ID 或公证；下载可能重新添加隔离属性，不承诺无提示打开。
