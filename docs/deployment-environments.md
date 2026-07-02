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

## Secret 规则

不要把 bot token、webhook secret、Cloudflare secret 写进 `wrangler.jsonc`、文档或提交记录。

本地开发时，可以复制 `apps/worker/.dev.vars.example` 为 `apps/worker/.dev.vars`，再按需改成本地测试值。`.dev.vars` 不应提交。

每个环境都应该单独配置 secret：

```bash
wrangler secret put TELEGRAM_BOT_TOKEN --env staging
wrangler secret put TELEGRAM_WEBHOOK_SECRET --env staging
wrangler secret put TELEGRAM_BOT_TOKEN --env production
wrangler secret put TELEGRAM_WEBHOOK_SECRET --env production
```

staging 与 production 必须使用不同的 Telegram bot、不同的群组和不同的 webhook secret。

## 发布流程

1. 合并代码到 `main`。
2. 部署 staging。
3. 在测试 bot 与测试群中完成实际流程测试。
4. 确认数据、日志、管理员操作和用户体验没有明显问题。
5. 部署 production。
6. 在正式群中小范围观察，再扩大使用范围。

未来新增功能也按这个流程进入正式群，避免未经体验的功能直接影响同学们。
