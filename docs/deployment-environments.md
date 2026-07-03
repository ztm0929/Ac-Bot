# 部署环境

本项目使用两套线上环境，先在预览环境完成真实体验，再部署到生产环境。

## 环境划分

| 项目 | staging | production |
| --- | --- | --- |
| 用途 | 测试 bot 与测试群体验 | 正式 bot 与正式群使用 |
| Worker | `ac-bot-worker-staging` | `ac-bot-worker-production` |
| D1 | `ac-bot-staging` | `ac-bot-production` |
| Queue | `platform-events-staging` | `platform-events-production` |
| Telegram bot | 测试 bot | 正式 bot |
| Telegram 群组 | 测试群 | 正式群 |

## 部署命令

预览环境：

```bash
pnpm --filter @ac-bot/worker deploy:staging
```

生产环境：

```bash
pnpm --filter @ac-bot/worker deploy:production
```

## 数据库迁移

部署前应先对对应环境执行 D1 migration。staging 和 production 使用不同数据库，不能混用命令。

staging：

```bash
pnpm --filter @ac-bot/worker db:migrate:staging
```

production：

```bash
pnpm --filter @ac-bot/worker db:migrate:production
```

迁移文件统一放在 `packages/db/migrations/`。执行 production 迁移前，应先确认同一批迁移已经在 staging 跑过，并完成测试群体验。

## Secret 规则

不要把 bot token、webhook secret、Cloudflare secret 写进 `wrangler.jsonc`、文档或提交记录。

本地开发时，可以复制 `apps/worker/.dev.vars.example` 为 `apps/worker/.dev.vars`，再按需改成本地测试值。`.dev.vars` 不应提交。

每个环境都应该单独配置 secret：

```bash
wrangler secret put TELEGRAM_BOT_TOKEN --env staging
wrangler secret put TELEGRAM_WEBHOOK_SECRET --env staging
wrangler secret put TELEGRAM_ADMIN_USER_IDS --env staging
wrangler secret put TELEGRAM_BOT_TOKEN --env production
wrangler secret put TELEGRAM_WEBHOOK_SECRET --env production
wrangler secret put TELEGRAM_ADMIN_USER_IDS --env production
```

staging 与 production 必须使用不同的 Telegram bot、不同的群组和不同的 webhook secret。

`TELEGRAM_ADMIN_USER_IDS` 是早期 Telegram 场景实测用的管理员白名单，多个 Telegram user id 用英文逗号分隔。正式管理员权限仍应迁移到数据库中的管理员配置。

## Telegram webhook

部署 Worker 并配置对应环境的 secret 后，可以为测试 bot 或正式 bot 设置 webhook。

staging：

```bash
pnpm --filter @ac-bot/worker telegram:set-webhook:staging
```

production：

```bash
pnpm --filter @ac-bot/worker telegram:set-webhook:production
```

脚本需要从本机环境变量读取对应环境的 bot token、webhook URL 和 webhook secret：

```bash
TELEGRAM_STAGING_BOT_TOKEN
TELEGRAM_STAGING_WEBHOOK_URL
TELEGRAM_STAGING_WEBHOOK_SECRET
TELEGRAM_PRODUCTION_BOT_TOKEN
TELEGRAM_PRODUCTION_WEBHOOK_URL
TELEGRAM_PRODUCTION_WEBHOOK_SECRET
```

如需先验证参数而不请求 Telegram API，可以设置：

```bash
TELEGRAM_SET_WEBHOOK_DRY_RUN=true
```

Webhook URL 必须使用 `https://`，并指向 `/webhooks/telegram`。

## Telegram 测试准备

staging 实测需要在 Telegram 里准备：

1. 测试 bot。
2. 测试群。
3. 把测试 bot 加为测试群管理员，并授予邀请用户权限。
4. 创建一个需要管理员批准的邀请链接。普通邀请链接会让用户直接入群，不会产生 `chat_join_request`。
5. 准备至少一个管理员 Telegram user id，写入 staging 的 `TELEGRAM_ADMIN_USER_IDS`。
6. 准备另一个 Telegram 账号作为申请入群的普通用户。

## 发布流程

1. 合并代码到 `main`。
2. 对 staging 执行数据库迁移。
3. 部署 staging。
4. 在测试 bot 与测试群中完成实际流程测试。
5. 确认数据、日志、管理员操作和用户体验没有明显问题。
6. 对 production 执行数据库迁移。
7. 部署 production。
8. 在正式群中小范围观察，再扩大使用范围。

未来新增功能也按这个流程进入正式群，避免未经体验的功能直接影响同学们。
