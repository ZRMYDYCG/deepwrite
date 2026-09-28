---
name: package-patch-release
description: 为 DeepWrite 桌面端递增一个 SemVer 补丁版本，安全清理上一个版本的测试打包残留，使用项目规定的 pnpm pack:test 命令构建并验证新安装包，按用户要求决定是否创建并发布 GitHub Release；Release 完整可下载后更新根目录 update.json，并通过路径限定提交和推送，保证该提交只包含 update.json。用于用户提出“打包新版本”“提高一小个版本并打包”“清理旧包后发 Release”“更新 update.json 并只提交该文件”等版本交付请求。
---

# 打包补丁版本并按需发布

从仓库根目录执行 DeepWrite 测试版交付。把“提高一小个版本”解释为 SemVer 补丁位加一，例如 `1.2.0 -> 1.2.1`。不得把测试包描述为正式签名、公证后的发布包。

## 不可破坏的边界

- 先读 `.codex/skills/windows-macos-test-package/SKILL.md` 和 `docs/GitHub-Release测试版自动更新发布说明.md`；测试安装包规则与本技能冲突时，以测试安装包技能为准。
- 当前工作树可以很脏。把已有修改全部视为用户资产，不得还原、覆盖、删除、暂存或混入提交。
- 只修改版本交付所需的 `package.json`、`apps/desktop/package.json` 和发布成功后的 `update.json`。不得顺手修改业务代码或打包配置。
- 最终 Git 提交只能包含根目录 `update.json`。两个 `package.json` 的版本修改留在工作树中，不得暂存或提交；这是本技能的明确交付约束。
- 不得使用 `git add .`、`git add -A`、`git commit -a`、`git stash`、`git reset`、`git checkout --` 或 `git clean`。
- GitHub Release 是外部发布动作。用户已明确说“发布、上传 Release、发 GitHub”时执行；用户明确说不发布时不执行；用户未表态时必须在打包完成后询问，不得自行发布。
- 没有已发布且资产完整可下载的对应 Release 时，不得提高、提交或推送 `update.json`，否则客户端会发现一个无法下载的版本。用户要求“不发 Release 但更新清单”时，说明矛盾并等待决定。

## 1. 建立基线

1. 读取 Git 状态、当前分支、远端、根目录 `package.json`、`apps/desktop/package.json`、`update.json`、现有 tag 和 `apps/desktop/release/` 清单。
2. 记录开始前每个允许修改文件的内容或 diff，以便区分本轮修改与用户已有修改；不得用恢复命令回滚用户内容。
3. 要求两个 `package.json` 的 `version` 一致且为三段 SemVer。若不一致，先判断是否存在一次尚未完成的版本准备；无法可靠判断时停止并询问，禁止盲目覆盖。
4. 以两个 `package.json` 的共同版本为旧版本，将补丁位加一得到新版本。确认新版本大于 `update.json.version`，并确认远端不存在冲突的 `v<新版本>` Release/tag；存在冲突时不得覆盖或删除，报告并等待用户决定。
5. 用户指定了明确版本时优先使用该版本，但仍要求它大于当前版本，并说明这不再是默认的补丁递增。

## 2. 清理旧版本打包残留

只处理固定目录 `apps/desktop/release/` 内可证明属于旧版本或 electron-builder 的生成物。

1. 先列出候选项并解析为绝对路径，确认目录没有越界、候选不含源码或用户文档。
2. 删除名称含旧版本的 `DeepWrite-<旧版本>-*` 产物，以及本次目标会重建的已知中间输出：`mac/`、`mac-arm64/`、`win-unpacked/`、`.icon-icns/`、`latest.yml`、`latest-mac.yml`、`builder-debug.yml`、`builder-effective-config.yaml`。
3. 对随机名、未知名或无法证明来源的条目不做删除，只报告。不得对仓库根目录、工作区或未解析的变量执行递归删除，也不得使用 `git clean`。
4. 删除后再次列目录，确认旧版本安装包和旧更新清单不再残留。说明删除了什么，以及生成物只能通过重新打包恢复。

## 3. 提高版本并打包

1. 只把两个 `package.json` 的顶层 `version` 同步改为新版本，保持其他内容和格式不变。暂时不要修改 `update.json`。
2. 重新读取两个值并确认一致。打包命令必须从仓库根目录运行，不能直接调用 electron-builder，也不能跳过内置的 `pnpm verify`：
   - 未指定平台或要求全部：`pnpm pack:test`
   - Windows x64：`pnpm pack:test:win`
   - macOS arm64：`pnpm pack:test:mac:arm64`
   - macOS x64：`pnpm pack:test:mac:x64`
   - 两种 macOS 架构：`pnpm pack:test:mac`
3. 命令失败时保留终端关键输出，报告失败的平台、架构和步骤；不得继续发布，也不得声称包可用。
4. 成功后检查请求平台对应的安装包、ZIP、blockmap 和 `latest*.yml` 均存在且非空。核对文件名版本、更新清单版本和清单内引用文件名一致。
5. Mac 产物还要确认 DMG 校验通过、App 为完整 ad-hoc 签名，并检查本地 DMG 是否意外带有 `com.apple.quarantine`；存在时仅从明确的新 DMG 发布产物移除该属性。不得声称接收端不会重新添加隔离属性。
6. 记录打包脚本的冒烟结果。受主机系统限制跳过目标平台运行时，明确写“只完成构建，未完成目标平台运行验证”。

## 4. 按用户要求处理 GitHub Release

用户不发布时，到本地打包交付为止，不修改 `update.json`，也不创建 tag、Release 或提交。

用户要求发布时：

1. 使用仓库 `swjybky/deepwrite` 和 tag `v<新版本>`。先检查 `gh auth status`、远端仓库、同名 tag/Release 和待上传资产，禁止覆盖已有 Release。
2. 根据用户提供的说明编写 Release notes；用户未提供时，从本轮实际变更生成简洁中文说明，不虚构功能。
3. 先创建 Draft Release，标题为 `DeepWrite <新版本>`，稳定版不得标为 prerelease。只上传本次请求平台实际成功构建且被更新清单引用的资产：
   - Windows x64：EXE、EXE blockmap、`latest.yml`。
   - macOS：各目标架构的 DMG、ZIP、ZIP blockmap，以及最终 `latest-mac.yml`。
4. 同时发布两种 Mac 架构时，先检查最终 `latest-mac.yml` 是否同时正确引用两个 ZIP 及各自 SHA-512。若清单只包含一个架构，保持 Draft 并停止，不得发布残缺自动更新。
5. 用 GitHub 返回的资产列表逐项核对名称、数量和非零大小；确认 Draft 完整后再发布，并确认不是 prerelease。
6. 发布后再次读取 Release，确认 tag、标题、公开状态和每个下载 URL 可访问。任何检查失败时不更新 `update.json`。

## 5. 最后更新并只提交 update.json

仅在 Release 已公开且资产验证全部通过后执行：

1. 保持 `schemaVersion`、`enabled`、`channel`、`mandatory`、`minimumSupportedVersion` 和 `feedUrl` 的既有语义，更新：
   - `version` 为新版本。
   - `title` 为 `DeepWrite <新版本>`。
   - `publishedAt` 为发布完成时的 Asia/Shanghai ISO 8601 时间。
   - `releaseNotes` 为与 Release 一致的真实说明。
   - `releasePage` 为 `https://github.com/swjybky/deepwrite/releases/tag/v<新版本>`。
2. 校验 `update.json` 是合法 JSON，且其版本与两个 `package.json`、Git tag、`latest.yml` / `latest-mac.yml` 一致。
3. 不改动现有暂存区。使用路径限定提交，例如 `git commit --only -m "chore: update release manifest to v<新版本>" -- update.json`；即使暂存区已有其他文件，也不得把它们带入该提交。
4. 立即运行 `git show --name-only --format= HEAD`。结果必须恰好只有 `update.json`；若不是，停止且不得推送。
5. 推送前获取远端并比较目标分支。`origin/main..HEAD` 必须恰好只有本次 `update.json` 提交；若还包含其他未推送提交，或当前历史不能快进目标分支，停止并询问，不得把额外历史一起推送。
6. 推送当前提交到用户指定远端/分支。未指定时按项目发布约定推送到 `origin/main`；不得为此切换或清理脏工作树，禁止 force push。
7. 推送后读取远程 `main/update.json`，确认版本和内容已生效；再报告提交 SHA、Release URL、产物清单与未被提交的两个 `package.json` 版本修改。

## 完成检查

- 补丁版本只增加一次，两个 `package.json` 一致。
- 旧版生成物已按明确清单清理，未知文件未动。
- 使用规定的 `pnpm pack:test:*` 命令且验证结果真实。
- 只有用户授权时才发布 GitHub Release。
- Release 未完成时绝不提前更新更新清单。
- Git 提交文件列表恰好是 `update.json`，其他工作树和暂存区内容保持原状。
- 推送范围恰好只有该清单提交，不夹带当前分支的其他未推送提交。
- 对签名、公证、跨平台运行验证和 Gatekeeper 限制作出准确说明。
