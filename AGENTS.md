# AGENTS.md

## 项目概览

Ac-Bot 是一个社群专属的跨平台机器人系统。当前 MVP 只实现 Telegram 入群申请验证与审批，但架构必须保留 QQ、Discord、Matrix 等平台 adapter 的扩展入口。

核心原则：

- 一个仓库维护所有平台能力。
- 核心模块保持平台无关。
- Telegram API 只能出现在 `apps/worker/src/adapters/telegram/` 或 Telegram 专属 contract 中。
- 入群申请、成员档案、风控、验证、审计等能力应由 core modules 承载。

## 关键文档

实现前先阅读：

- `docs/specs/0001-community-bot-platform-mvp.md`

该 spec 是当前项目的主要设计来源。除非用户明确要求调整架构，否则实现应遵守其中的技术选型、模块边界和 MVP 范围。

## 技术栈

- TypeScript
- Cloudflare Workers Runtime
- Hono
- grammY，仅用于 Telegram adapter
- Cloudflare D1
- Drizzle ORM 与 drizzle-kit
- Cloudflare Queues
- Cloudflare Cron Triggers
- Cloudflare R2
- Cloudflare Turnstile
- React + Vite
- pnpm
- Vitest
- Wrangler

## 代码组织规则

- 平台相关代码放在 `apps/worker/src/adapters/<platform>/`。
- 平台无关业务放在 `apps/worker/src/modules/` 或 `apps/worker/src/core/`。
- 数据库 schema 和迁移放在 `packages/db/`。
- 跨平台类型放在 `packages/platform-contracts/src/core/`。
- Telegram 专属类型放在 `packages/platform-contracts/src/telegram/`。
- 不要在 core modules 中直接使用 `ChatJoinRequest`、`approveChatJoinRequest`、`declineChatJoinRequest`、`telegram_user_id`、`chat_id` 等 Telegram 专属概念。

## 变更边界

当前优先级：

- Telegram 入群申请验证与审批
- 平台无关核心模型
- Cloudflare Workers / D1 / Queues 基础架构
- 风险评分、验证流程、管理员审核、审计日志

暂不主动实现偏离 MVP 的大型功能，例如支付系统、多社区 SaaS、AI 风控、完整 Web 管理台、积分系统。用户明确要求时，先补充或更新 spec，再进入实现。

如果变更影响架构、数据模型、平台 adapter 边界或用户流程，应同步更新 `docs/specs/` 中的相关规格文档。

## 开发命令

项目尚未脚手架化。脚手架完成后，应在这里补充实际命令。

预期命令形态：

- 安装依赖：`pnpm install`
- 本地开发：`pnpm dev`
- 类型检查：`pnpm typecheck`
- 测试：`pnpm test`
- 数据库迁移：`pnpm db:migrate`
- 部署：`pnpm deploy`

## 测试要求

- 修改平台 adapter 时，至少覆盖平台事件到核心事件的映射。
- 修改核心状态机时，必须覆盖状态流转、重复事件幂等、失败重试。
- 修改数据库 schema 时，必须同步更新迁移和相关类型。
- 修改安全相关逻辑时，必须覆盖 webhook secret、Mini App init data、管理员权限校验。

## 安全注意事项

- 不要提交 bot token、webhook secret、Cloudflare secret、R2 key 或 Turnstile secret。
- 日志不得输出完整敏感资料。
- 管理员权限必须按 `platform + platform_account_id` 校验。
- 所有自动拒绝和人工覆盖都必须写入审计记录。

## 提交前检查

在项目脚手架完成后，提交前应运行：

- `pnpm typecheck`
- `pnpm test`

如果命令尚不存在，在最终回复中说明未运行的原因。

## 分支与提交

不要直接在本地或远程的主分支（如 `main`、`master`）上提交或推送改动。开始工作前应优先从最新主分支新建工作分支，完成内容改动、检查和提交后，通过 Pull Request 合并回主分支。

一次 Pull Request 应只解决一个清晰的问题或交付一个内聚的小目标。不要把无关的重构、格式化、依赖升级、文档调整和功能实现混在同一个 PR 或同一个 commit 中。commit 应符合开源社区常见实践：主题明确、范围适中、可单独 review；如果改动自然分成多个逻辑步骤，应拆成多个相关 commit，而不是堆成一个大提交。

合并 PR 时优先使用 Squash and merge，让 `main` 分支保持每个 PR 一个清晰提交。squash 后的提交信息应保留规范的类型前缀、中文说明，以及需要的 `Co-authored-by:` 或 `Assisted-by:` trailer。

分支命名：

- `feat/<short-name>`：新增功能
- `fix/<short-name>`：修复问题
- `docs/<short-name>`：文档变更
- `chore/<short-name>`：工程杂项
- `refactor/<short-name>`：重构
- `test/<short-name>`：测试相关

提交信息优先使用中文，但必须保留英文类型前缀。格式：

```text
<type>: <中文说明>
```

常用类型：

- `feat:` 新增功能
- `fix:` 修复问题
- `docs:` 文档变更
- `chore:` 工程配置、依赖、脚本等杂项
- `refactor:` 不改变行为的代码重构
- `test:` 新增或修改测试
- `style:` 格式、排版、命名等不影响逻辑的修改
- `ci:` CI/CD 相关变更
- `build:` 构建系统或依赖管理变更
- `revert:` 回退提交

示例：

```text
feat: 新增 Telegram 入群申请映射
fix: 修复验证超时处理
docs: 补充平台适配器约束
chore: 初始化 pnpm workspace
refactor: 拆分风险评分服务
test: 覆盖重复入群申请幂等逻辑
```

全英文提交信息也可以接受，例如：

```text
feat: add Telegram join request mapper
fix: handle verification timeout correctly
```

如果本次改动主要由 Codex 完成，commit author 可以使用 Codex，并在 commit message 末尾追加实际人工负责人的共同作者信息。以下 `ztm0929` 仅为本仓库当前维护者示例，不能在其他人工负责人场景中硬编码复用：

```text
Co-authored-by: ztm0929 <34964951+ztm0929@users.noreply.github.com>
```

如果本次改动主要由人工完成、Codex 或其他 AI 工具只是辅助，可以使用对应 AI 工具的官方 GitHub 身份作为 `Co-authored-by:` trailer；如果没有可验证 GitHub 身份，使用 `Assisted-by: <工具名称>` 透明标注。无论署名顺序如何，合并到仓库中的代码都由提交者、人工负责人和 reviewer 共同负责。
