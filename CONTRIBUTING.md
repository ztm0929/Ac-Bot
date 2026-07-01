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

## 分支与提交

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
