# DeepWrite 仓库约定

按任务读取相关代码与文档；以下是新增或修改代码时需要守住的项目边界。

## 基础能力介绍

DeepWrite 的基础核心能力是创作空间、素材库、技能库和设置页面；它们共同构成日常写作与管理的主流程。

| 能力 | 作用 |
| --- | --- |
| 创作空间 | 管理短篇、剧本和长篇作品，围绕阶段、章节与正文开展编辑和智能体协作。 |
| 素材库 | 保存可复用的素材条目，并按作品需要关联和读取。 |
| 技能库 | 保存可复用的写作方法与技能条目，供作品和智能体按需使用。 |
| 设置页面 | 管理模型、智能体、正文文本、外观等基础配置。 |

- **支撑机制：**基础能力共用智能体机制（模型与提示词配置、作品上下文、素材与技能读取、受控工具和修改提案）及文本机制（本地 Markdown、编辑与预览、正文格式、差异审阅和版本安全保存）。修改这些机制时，应检查其对四项基础能力的影响。
- **扩展能力：**侧边栏“更多功能”中的聊天、修改分析、短篇/长篇拆书、文风比对、同步与备份等建立在基础能力之上；扩展功能复用既有的智能体、文本、协议和存储机制，不另建平行实现。其中需要智能体的能力统一走下文的扩展智能体服务。

## 项目布局与职责

DeepWrite 是 pnpm workspace，`apps/desktop/` 是唯一桌面客户端。根目录 `package.json` 提供开发、检查和打包入口，依赖版本由 `pnpm-workspace.yaml` 的 catalog 管理。新增能力先放入现有分层，不另建平行应用、协议或打包入口。

| 位置 | 职责 |
| --- | --- |
| `apps/desktop/src/main/` | Electron 窗口、配置与密钥、安全 IPC、Utility 监管 |
| `apps/desktop/src/preload/` | `window.deepwrite` 专用 API 与请求、响应校验 |
| `apps/desktop/src/utilities/` | Core 本地存储、Agent 运行、Tool 受控执行 |
| `apps/desktop/src/renderer/` | Vue 工作台、界面状态与会话编排 |
| `apps/desktop/src/extras/` | 由 Main 注册的可选能力，含扩展智能体服务 `extras/agents/`；对应界面放在 Renderer 的 `extras/` |
| `apps/desktop/scripts/` | Electron 冒烟、安装包验证与构建钩子 |
| `packages/contracts/` | 命令、事件和领域模型的 Zod 契约 |
| `packages/pi-runtime-adapter/` | Pi 运行时、工具 schema 与受控工具适配；`kernel/` 为共享运行内核，`extras/` 为扩展智能体定义 |
| `packages/shared/` | 无业务语义的共用工具 |
| `tools/` | 边界检查、运行时与打包编排 |

## 进程、协议与写入边界

- **IPC 与凭据：**Renderer 只从 `@deepwrite/contracts/renderer` 引入契约运行时值；不得直接引入 `electron`、`node:`、Pi SDK 或 `@deepwrite/pi-runtime-adapter`。Provider 凭据和模型密钥只留在 Main / Agent。跨进程通信使用 `@deepwrite/contracts` 的 Envelope 命令与事件，不开放任意 IPC 通道。
- **契约变更：**新增命令、事件、清单字段或 Preload API 时，先更新 `packages/contracts` 的类型与 schema，再接通 Preload、Main 路由和相应 Utility；Renderer 所需的契约运行时值还要从 `packages/contracts/src/renderer.ts` 导出。Preload 只暴露经过双向校验的专用方法。
- **本地写入：**Core Utility 是本地项目与路径注册表的唯一写入者，写入须保持原子性。本地作品以文件夹存放，清单为 `deepwrite.json`，正文与设定为 UTF-8 Markdown；短篇、剧本、素材库和技能库由 `folder-catalog-store` 管理，长篇由 `long-project-store` / `long-workspace-service` 管理。Agent 读取作品须经 Main 授权的 Core 只读桥；修改文稿须先展示 proposal 差异，用户接受后才由 Core 落盘，并处理版本冲突。
- **界面组织：**`WorkspaceShell.vue` 是工作台壳，默认三栏写作面留在入口，其他领域界面按现有 `lazyAppComponents` 按需加载。界面状态放 `stores/`，跨组件流程放 `composables/`，领域页面放 `features/` 或 `extras/`；业务写入留在 coordinator / Utility handler。可选能力沿用 Main `extras/`、Renderer `extras/` 和同一套 contracts。
- **智能体运行分域：**所有智能体共用 `pi-runtime-adapter/src/kernel/` 的运行内核（模型接入、重试、超时、工具流、用量事件、中止）。创作空间和资料库经 `session.prompt` 进入创作域（`workspace-run-plan.ts`）；“更多功能”的智能体（聊天与各类分析）经 `extrasAgent.run` 进入扩展域，不得再向 `session.prompt` 载荷或 `WorkspaceRuntimeContext` 添加扩展功能字段。
- **扩展智能体服务：**
  - **协议：**contracts 的 `extras-agent/` 定义智能体 ID、档案、任务输入、结果和命令。Renderer 只传 `profileId`，档案由 Main 的 `ExtrasAgentConfigStore`（`config/extras-agents/<agentId>.json`）权威解析，聊天所需的作品、模型和用量快照也只由 Main 的 `resolveExtrasTask` 读取；预算经 `assertExtrasAgentBudget` 在 Renderer 预检、Main 与 Agent 复核。
  - **两种交互：**分析类是一次性任务（`ExtrasTaskAgentDefinition`），每次运行由任务生成用户消息；聊天是对话（`ExtrasConversationAgentDefinition`，ID 见 `EXTRAS_CONVERSATION_AGENT_IDS`），运行请求必须携带 `conversation` 轮次（消息、历史、附件），Agent Utility 按 `conversationKey` 缓存对话。
  - **定义：**每个智能体在 `pi-runtime-adapter/src/extras/agents/` 有一份定义。系统提示词统一为“档案提示词 + 不可编辑的 `【名称运行边界】`”；工具只能由开发者在定义里从 `extras/tools/` 组合，不向用户开放。分析结果经结果工具或 `finalOutput` 统一发出 `extras_agent.output_updated`。
  - **界面：**分析页面用 `extras/agent-runtime/startExtrasAgentTask` 运行任务，不在页面里重复会话、事件过滤、停止与销毁逻辑；聊天复用 `useAgentConversation`，由 `sendAssistantMessage(task)` 经 `send-transport.ts` 发往扩展域。
  - **新增步骤：**依次补 contracts 的 ID、档案与输入 schema、结果类型和用量模块映射，`profile-catalogs.ts` 的内置档案（需要 Main 权威数据时再补 `task-resolver.ts`），`extras/agents/` 的定义与 Faux 响应，`resolveExtrasAgent` 注册，最后接页面。
- **进程与打包：**打包入口包括 Main `src/main/index.ts`、`core-entry` / `agent-entry` / `tool-entry`、Preload 和 Renderer。改动进程入口、Utility 或安装包 `files` 时，同步检查 `apps/desktop/electron.vite.config.ts`、supervisor 启动路径、冒烟脚本和 `pnpm lint:boundary`；改变运行时依赖的打包方式时还要检查 before-build 钩子与安装包内运行。

## 代码质量与验证

- `.editorconfig`、`prettier.config.mjs`、`eslint.config.js` 是格式与静态检查的统一来源。只格式化任务涉及的文件，不因功能修改带入无关的大面积格式变化。按改动运行相关检查；根目录可用 `pnpm format:check`、`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 和完整的 `pnpm verify`。
- 文件行数是评审提示，不是机械硬门槛。以下建议上限用于新文件及本次实质修改的模块；按格式化后的手写物理行计数，空行、注释和 Vue 的各区块均计入，生成代码与大型静态数据除外：

  | 文件 | 建议上限 |
  | --- | ---: |
  | Vue 页面或工作台壳 | 400 行 |
  | 可复用或局部 Vue 组件 | 300 行 |
  | store、composable、service、handler、Pi adapter | 300 行 |
  | contracts 类型与 schema | 350 行 |
  | Main / Utility 入口、Preload 白名单 | 200 行 |
  | `shared` 纯工具、构建配置与 `tools/` 脚本 | 250 行 |
  | 独立 CSS | 300 行 |
  | 测试文件 | 500 行 |

- 超出建议上限或出现职责混杂时，先去除重复，再按 UI、状态流程、协议、特权操作等真实职责拆分，保持明确接口和单向依赖。不要为了凑行数压缩代码或制造转发层；较长但内聚的模块可以保留，并在评审时说明原因。测试优先验证可观察行为与失败路径；跨进程、安装包等改动还需相应的集成或桌面验证，不能以类型检查或构建代替运行验证。

## 测试数据中的敏感信息

- 测试代码、夹具、快照、示例请求、Mock 数据和日志不得包含真实接口地址、服务器 IP、生产域名或可用凭据。示例地址使用 `example.test` 等保留测试域名，凭据使用明显无效的占位值；确需读取本地值时，只能在运行时从已被 Git 忽略的环境文件获取，不能把值写进快照或输出。
- 检查本次新增或修改的测试材料是否泄露信息；发现泄露时先移除明文，并轮换已经暴露的凭据。

## 前端反馈与布局

- 表单校验、操作错误、成功和普通提示使用不占布局空间的 toast、message 或 notification；无需用户处理的提示自动消失。临时错误或警告不得插入表单、弹窗和按钮之间，避免高度变化与按钮跳动。
- 只有必须由用户确认才能继续的风险操作使用模态确认。字段说明可作为稳定辅助文案，但不承载临时错误或警告。

## 前端视觉、主题与控件

- 新页面和弹窗沿用现有容器层级、间距、圆角与控件样式；拆书分析等复杂页面以设置页为参照。颜色优先使用 `--surface-main`、`--surface-raised`、`--surface-muted`、`--surface-hover`、`--surface-selected`、`--theme-line`、`--theme-line-soft`、`--text-primary`、`--text-secondary`、`--text-tertiary`、`--accent`、`--accent-soft`，避免给普通容器另设固定色板。
- 与“设置 → 外观”实时联动：主题模式、强调色、背景色、前景色、UI 字号和可读性设置变化后应即时生效。`Teleport` 弹层同样使用根节点主题变量；检查浅色、深色和自定义强调色下的对比度，以及紧凑窗口和允许的字号范围，避免固定高度导致裁切。
- 业务表单中的列表选择框复用 Renderer 的 `PopupSelect`，保持尺寸、焦点、禁用态和交互一致，不混用原生 `<select>`；弹窗中的菜单须高于弹窗且不被裁切。
- 保存、创建、确认等主操作使用现有中性深色实心按钮；红色危险按钮只用于删除持久数据或不可恢复的覆盖；只清空临时内容的操作（如重新开始一次分析）使用普通主按钮。
