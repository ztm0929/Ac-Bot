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
wrangler secret put VERIFICATION_ANSWER_TEXT --env staging
wrangler secret put TELEGRAM_BOT_TOKEN --env production
wrangler secret put TELEGRAM_WEBHOOK_SECRET --env production
wrangler secret put VERIFICATION_ANSWER_TEXT --env production
```

staging 与 production 必须使用不同的 Telegram bot、不同的群组和不同的 webhook secret。

`VERIFICATION_ANSWER_TEXT` 是私有运营配置，不应写入仓库、PR 描述、普通日志或截图。staging 可以使用与 production 不同的测试答案。

## Staging smoke test 配置

当前进入 staging 的目标是验证 Telegram 公开群新人验证主链路是否能跑通，不追求高质量拦截。建议先使用低风险直通配置：

```bash
wrangler secret put VERIFICATION_ANSWER_TEXT --env staging
```

`VERIFICATION_RISK_LEVEL=low`、验证超时、答题次数、累计失败/超时阈值、观察期时长和默认提示文案已经作为 staging 的非敏感默认配置写入 `apps/worker/wrangler.jsonc`。如需临时演练中风险或高风险路径，可以在 staging 部署前修改 `VERIFICATION_RISK_LEVEL` 为 `medium` 或 `high`，测试完成后应改回 `low`。

验证提示支持 `plain_text`、`markdown`、`html`、`latex_inline` 和 `latex_block`。分别通过
`VERIFICATION_PROMPT_FORMAT` 与 `VERIFICATION_PROMPT_GROUP_FALLBACK_FORMAT` 配置私聊提示和群内回退提示；
未配置时默认使用纯文本，未知格式会拒绝处理，避免把格式标记原样发送给用户。

当前 staging smoke test 建议保持 `low`，先确认新人能完成简单答题并恢复文本权限。

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

## Staging smoke test 检查清单

1. 测试 bot 已加入测试群，并具有限制成员、封禁成员和发送消息权限。
2. staging 已配置 `TELEGRAM_BOT_TOKEN`、`TELEGRAM_WEBHOOK_SECRET`、`VERIFICATION_ANSWER_TEXT`。
3. staging 已执行 D1 migration。
4. staging Worker 已部署成功。
5. 测试 bot webhook 已设置到 staging Worker 的 `/webhooks/telegram`。
6. 新账号加入测试群后应立即被限制发言。
7. bot 应优先私聊发送验证引导；如果私聊失败，应在群内发送短提示。
8. 新账号在私聊中发送正确答案后，应进入 24 小时文本观察期。
9. 新账号发送错误答案达到单次上限后，应被移出；累计达到阈值后应被永久封禁。
10. 新账号完全不验证超过 3 分钟后，应被定时任务移出；累计达到阈值后应被永久封禁。
