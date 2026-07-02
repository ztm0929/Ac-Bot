# 贡献指南

感谢你关注 Ac-Bot。

Ac-Bot 是一个社群专属的跨平台机器人系统。当前 MVP 聚焦 Telegram 入群申请验证与审批，后续会逐步扩展到 QQ、Discord、Matrix 等平台。

## 开始之前

在开始实现或修改前，请先阅读：

- `README.md`
- `AGENTS.md`
- `docs/specs/0001-community-bot-platform-mvp.md`

当前项目采用 spec-driven development。规格文档是长期维护的设计依据，不应在功能实现后删除。

## 贡献范围

当前优先级：

- Telegram 入群申请验证与审批
- 平台无关核心模型
- Cloudflare Workers / D1 / Queues 基础架构
- 风险评分、验证流程、管理员审核、审计日志

暂不接受偏离 MVP 的大型功能，例如：

- 支付系统
- 多社区 SaaS
- AI 风控
- 完整 Web 管理台
- 积分系统

这些功能可以先通过 issue 或新 spec 讨论。

## 开发原则

- 核心模块必须平台无关。
- Telegram API 只能出现在 `apps/worker/src/adapters/telegram/` 或 Telegram 专属 contract 中。
- 不要在 core modules 中直接使用 `ChatJoinRequest`、`approveChatJoinRequest`、`declineChatJoinRequest`、`telegram_user_id`、`chat_id` 等 Telegram 专属概念。
- 所有状态变化必须写入审计日志。
- 所有外部请求必须有超时和错误处理。
- 不要提交任何 token、secret、私钥或真实用户数据。

## AI 编程助手

本项目鼓励使用 AI 编程助手，包括但不限于 Codex、Claude Code、Cursor、GitHub Copilot 等。AI 工具可以用于阅读代码、生成草稿、实现功能、补充测试、检查文档和排查问题。

使用 AI 工具时必须遵守：

- 提交者需要理解并审查 AI 生成的代码。
- 提交者对最终提交的正确性、安全性、版权风险和维护成本负责。
- 不要把 token、secret、私钥、真实用户资料、导出的审核或问卷数据提供给 AI 工具。
- AI 生成的代码必须经过与人工代码相同的测试、review 和安全检查。
- 如果 AI 工具修改了架构、数据模型、平台 adapter 边界或用户流程，应同步更新 `docs/specs/` 中的相关规格文档。

AI 工具不是责任主体。合并到仓库中的代码由提交者和 reviewer 共同负责。

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

如果提交中有 AI 工具实质参与，应在 commit message 末尾标注。GitHub 支持 `Co-authored-by:` trailer；要在 GitHub 页面显示为共同作者，该邮箱必须关联到对应 GitHub 账号，或使用该账号的 GitHub no-reply 邮箱。参考 GitHub 文档：<https://docs.github.com/en/pull-requests/committing-changes-to-your-project/creating-and-editing-commits/creating-a-commit-with-multiple-authors>

当 AI 工具是主要实现者时，可以将该 AI 工具作为 commit author，并将人工负责人写入 `Co-authored-by:` trailer。署名顺序用于如实反映主要实现来源，不改变责任边界；提交者、人工负责人和 reviewer 仍需对最终提交负责。

格式：

```text
<type>: <中文说明>

Co-authored-by: <名称> <邮箱>
```

多人或多个工具共同参与时，每个共同作者单独一行：

```text
feat: 新增 Telegram 入群申请映射

Co-authored-by: Alice <alice@example.com>
Co-authored-by: Claude Code <claude@example.com>
```

本项目使用 Codex 作为主要实现者提交时，commit author 可以使用 GitHub 上的 `@codex` 账号：

```text
Codex <267193182+codex@users.noreply.github.com>
```

并在 commit message 中将人工负责人标注为共同作者：

```text
docs: 补充贡献指南

Co-authored-by: ztm0929 <34964951+ztm0929@users.noreply.github.com>
```

如果改动主要由人工完成、Codex 或其他 AI 工具只是辅助，可以使用对应 AI 工具的官方 GitHub 身份作为共同作者。其他 AI 工具如果有官方 GitHub 身份，也应使用对应的 GitHub no-reply 邮箱：

```text
Co-authored-by: <工具官方 GitHub 身份> <工具官方 GitHub 邮箱>
```

如果工具没有提供可验证的 GitHub 身份，不能保证 GitHub UI 显示为共同作者。此时使用 `Assisted-by:` 透明标注：

```text
Assisted-by: <工具名称>
```

## Pull Request 要求

PR 应包含：

- 变更目的
- 主要实现点
- 测试情况
- 是否修改 spec
- 是否涉及安全、权限或隐私数据

如果变更影响架构、数据模型、平台 adapter 边界或用户流程，应同步更新 `docs/specs/` 中的相关规格文档。

## 测试

项目尚未脚手架化。脚手架完成后，提交前应运行：

- `pnpm typecheck`
- `pnpm test`

如果命令尚不存在，请在 PR 中说明。

## 安全

请勿提交：

- Telegram bot token
- Cloudflare API token
- webhook secret
- R2 key
- Turnstile secret
- SSH key
- 真实用户资料
- 导出的审核或问卷数据

发现安全问题时，不要公开提交复现细节。请通过邮箱联系维护者：

- `ztm0929@icloud.com`
