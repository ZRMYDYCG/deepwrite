---
name: package-patch-release
description: 为 DeepWrite 递增补丁版本、清理旧产物、修复错误并继续打包；按授权发布 GitHub Release，发布验证后仅提交推送 update.json。用于打包新版本、提高一小个版本、清理旧包发布或更新发布清单。
---

# 打包补丁版本并按需发布

先读 [测试安装包技能](../windows-macos-test-package/SKILL.md)，命令、签名、验收及遇错修复按该技能执行；提交或推送时读 [git-commit](../git-commit/SKILL.md)。默认只交付本地测试包，用户明确要求发布时才执行 Release 流程。

## 边界

- 保留工作树和暂存区已有内容，不还原、覆盖或夹带用户修改；不使用 `git add .`、`git add -A`、`git commit -a`、`git stash`、`git reset`、`git checkout --`、`git clean` 或强推。
- 通常只改两个 `package.json` 的版本和发布成功后的 `update.json`；阻塞打包时允许最小修复相关代码、测试、配置及脚本，修复后继续完整打包验证。
- 本流程最终提交只能包含根目录 `update.json`；版本修改及故障修复留在工作树，不暂存或混入该提交。
- 对应 Release 未公开且资产未完整可下载前，不更新、提交或推送 `update.json`。不发布时不创建 tag、Release 或提交；要求不发 Release 却提高清单版本时说明依赖并请求决定。

## 1. 确定版本并清理

1. 检查 Git 状态、分支、远端、两个 `package.json`、`update.json`、相关 tag/Release 及 `apps/desktop/release/`。记录拟修改文件原内容或 diff，区分已有修改与本轮改动。
2. 两个 `package.json` 须为相同三段 SemVer；“提高一小个版本”只递增补丁位一次。用户指定版本优先，须大于基线及 `update.json.version`。已有未完成准备时先确认并沿用本轮版本，重试不重复递增；版本不一致且无法可靠判断、或 tag/Release 属于其他发布时请求决定，不盲目覆盖。
3. 仅清理 `apps/desktop/release/` 内解析后未越界、可证明属于旧版本或本次重建目标的生成物：`DeepWrite-<旧版本>-*`、相应的 `mac/`、`mac-arm64/`、`win-unpacked/`、`linux-unpacked/`、`.icon-icns/`、`latest*.yml`、`builder-debug.yml`、`builder-effective-config.yaml`。先列候选、再删除并核对；未知文件保留，简要说明清理结果。
4. 同步修改两个顶层 `version`，保持其他内容和格式；暂不改 `update.json`。

## 2. 打包并验收

1. 从根目录执行测试安装包技能对应的 `pnpm pack:test:*`。失败按其修复循环继续，不停在错误报告，也不带着失败结果发布。
2. 核对请求平台的安装包、更新资产和 `latest*.yml` 非空；文件名、清单版本、引用和 SHA-512 与实际产物一致。Mac 完成 DMG、ad-hoc 签名和隔离属性检查，并记录真实冒烟结果及跨平台限制。
3. 用户未授权发布时交付本地产物；已授权则继续以下流程。

## 3. 发布 GitHub Release

1. 检查 `gh auth status`、远端仓库 `swjybky/deepwrite`、tag `v<新版本>` 和资产。禁止覆盖他人或既有公开发布；重试先读取远端状态，仅接续能确认属于本轮的 Draft，避免重复创建、重复上传。
2. 先创建 Draft，标题 `DeepWrite <新版本>`；说明采用用户提供内容或已核实的实际变更，稳定版不标 prerelease。只上传本轮请求且验证成功的资产：Windows 为 EXE、EXE blockmap、`latest.yml`；Mac 为各架构 DMG、ZIP、ZIP blockmap、最终 `latest-mac.yml`；Linux 按构建配置和实际更新清单核对。
3. 两种 Mac 架构的最终清单须同时正确引用各 ZIP 与 SHA-512。缺项、上传或校验失败时保持 Draft，修复后补齐并重新核对，不能直接发布残缺自动更新。
4. 用 GitHub 返回的列表核对名称、数量、非零大小，完整后发布。再次确认 tag、标题、公开状态、非 prerelease 及各下载 URL 可访问，全部通过才更新 `update.json`。

## 4. 仅提交并推送 update.json

1. 保留清单其他字段语义，仅更新 `version`、`title`、与 Release 一致的 `releaseNotes`、发布完成时 Asia/Shanghai ISO 8601 `publishedAt`，以及 `https://github.com/swjybky/deepwrite/releases/tag/v<新版本>` 的 `releasePage`。
2. 校验 JSON 及版本与两个 `package.json`、tag、各 `latest*.yml` 一致。保留已有暂存区，用 `git commit --only -m "chore: update release manifest to v<新版本>" -- update.json` 限定提交。
3. `git show --name-only --format= HEAD` 必须恰好只有 `update.json`。推送前获取远端，目标分支到 HEAD 只能包含本次清单提交且可快进；否则保留成果并请求决定，不夹带其他历史。
4. 推送到用户指定远端/分支，未指定按发布约定用 `origin/main`。网络失败先核对远端 SHA 再重试，不重复提交；完成后读取远端清单确认生效。
5. 报告版本、产物路径、验证结果、必要修复、Release URL 和提交 SHA，并说明版本与修复仍留在工作树。
