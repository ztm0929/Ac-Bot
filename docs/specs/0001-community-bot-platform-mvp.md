# 社群专属跨平台 Bot 开发规格

版本：2026-07-01

## 1. 项目定位

构建一个社群专属跨平台 Bot 系统，作为社区统一治理入口。当前 MVP 只实现 Telegram 公开群入群后验证与治理；后续在同一个代码仓库内增量加入 QQ、Discord、Matrix 等平台 adapter，并继续扩展问卷调研、互动、资料收集、活动报名、通知、管理员审核与社区信息展示。

Telegram 正式群组必须保持公开群性质，不采用私有群邀请链接作为主要入口。因此 MVP 主路径不是 `chat_join_request` 入群前审批，而是用户通过公开群入口加入后，由 bot 执行验证、限制、解除限制、移出群组和审计记录。

产品形态固定为：

```text
一个社区治理核心
多个平台 adapter
多个内部功能模块
一套成员档案
一套权限与审计系统
```

不按社交平台拆分代码仓库。Telegram、QQ、Discord、Matrix 只是不同平台入口；入群审批、成员档案、风控、验证、问卷、审计等社区能力必须由平台无关的 core modules 承载。

当前只实现 Telegram adapter。QQ、Discord、Matrix adapter 只保留目录、接口和数据模型入口，不实现平台业务。

管理员能力先内置在同一个系统中，通过 Telegram 管理员菜单和审核群完成操作。只有当管理员能力变成独立产品后，才新增 Web 管理台；不新增第二个 Telegram bot。

## 2. 多平台架构原则

核心原则：

```text
仓库统一
平台隔离
核心平台无关
Telegram API 只出现在 Telegram adapter 内
```

核心模块只能使用平台中立概念：

```text
Platform
PlatformAccount
Community
CommunityMember
JoinApplication
VerificationSession
RiskEvent
AdminAction
AuditLog
```

核心模块禁止直接依赖这些 Telegram 专属概念：

```text
ChatJoinRequest
approveChatJoinRequest
declineChatJoinRequest
telegram_user_id
chat_id
```

Telegram 专属概念只能出现在：

```text
apps/worker/src/adapters/telegram/
packages/platform-contracts/src/telegram/
```

平台 adapter 负责把平台事件转换成统一内部事件：

```ts
type Platform = 'telegram' | 'discord' | 'matrix' | 'qq';

interface PlatformEventEnvelope {
  platform: Platform;
  eventType: string;
  rawEventId: string;
  receivedAt: string;
  payload: unknown;
}
```

平台 adapter 负责把核心动作转换成平台 API 调用：

```ts
interface PlatformAdapter {
  sendDirectMessage(input: SendDirectMessageInput): Promise<void>;
  sendVerificationPrompt(input: SendVerificationPromptInput): Promise<void>;
  restrictMember(input: RestrictMemberInput): Promise<void>;
  restoreMember(input: RestoreMemberInput): Promise<void>;
  removeMember(input: RemoveMemberInput): Promise<void>;
  banMember(input: BanMemberInput): Promise<void>;
  approveJoinApplication(input: ApproveJoinApplicationInput): Promise<void>;
  rejectJoinApplication(input: RejectJoinApplicationInput): Promise<void>;
  sendAdminReviewCard(input: SendAdminReviewCardInput): Promise<void>;
}
```

`approveJoinApplication` 和 `rejectJoinApplication` 是私有群、特殊邀请链接或未来平台的可选能力。Telegram 公开群 MVP 主路径优先使用 `restrictMember`、`restoreMember`、`removeMember`、`banMember` 和 `sendVerificationPrompt`。

MVP 只实现：

```text
TelegramPlatformAdapter
```

预留但不实现：

```text
DiscordPlatformAdapter
MatrixPlatformAdapter
QQPlatformAdapter
```

## 3. 唯一技术选型

```text
语言：TypeScript
运行时：Cloudflare Workers Runtime
Telegram adapter 框架：grammY
HTTP 框架：Hono
数据库：Cloudflare D1
ORM：Drizzle ORM
数据库迁移：drizzle-kit
异步队列：Cloudflare Queues
定时任务：Cloudflare Cron Triggers
应用运行环境：Cloudflare Workers
静态资源与 Mini App：Cloudflare Workers Static Assets
对象存储：Cloudflare R2
人机验证：Cloudflare Turnstile
前端：React 19 + Vite
包管理器：pnpm
测试：Vitest
部署 CLI：Wrangler
```

选择 Hono 的原因：Hono 原生适配 Cloudflare Workers，能用同一套路由模型处理 Telegram webhook、Mini App API、内部队列消费接口和健康检查。

Cloudflare 静态资源统一使用 Workers Static Assets。Cloudflare 官方 Workers 文档已将静态资源作为 Worker 部署单元的一部分，静态文件、API 路由和边缘逻辑在同一个 Workers 部署模型中处理。

相关文档：

- Cloudflare Workers: <https://developers.cloudflare.com/workers/>
- Cloudflare D1: <https://developers.cloudflare.com/d1/>
- Cloudflare Workers Static Assets: <https://developers.cloudflare.com/workers/static-assets/>
- Cloudflare Queues: <https://developers.cloudflare.com/queues/>
- Cloudflare Cron Triggers: <https://developers.cloudflare.com/workers/configuration/cron-triggers/>
- Cloudflare R2: <https://developers.cloudflare.com/r2/>
- Cloudflare Turnstile: <https://developers.cloudflare.com/turnstile/>
- Hono: <https://hono.dev/>
- grammY: <https://grammy.dev/>
- Drizzle ORM: <https://orm.drizzle.team/>
- Telegram Bot API: <https://core.telegram.org/bots/api>
- Telegram Bot API changelog: <https://core.telegram.org/bots/api-changelog>

## 4. 总体架构

```text
Telegram Bot API
  -> Cloudflare Worker: /webhooks/telegram
  -> Cloudflare Queue: platform-events
  -> Cloudflare Worker: queue consumer handler
  -> TelegramPlatformAdapter
  -> Core Modules
  -> Cloudflare D1
  -> Telegram Bot API

Future Platform APIs
  -> Cloudflare Worker: /webhooks/discord | /webhooks/matrix | /webhooks/qq
  -> Cloudflare Queue: platform-events
  -> Platform Adapter
  -> Core Modules
  -> Cloudflare D1

Mini App / 静态介绍页
  -> Cloudflare Worker Static Assets
  -> Cloudflare Worker API
  -> Cloudflare D1
  -> R2 / Turnstile
```

### 4.1 Cloudflare Worker: app

Cloudflare Worker 是唯一应用运行环境，同时承载 webhook 入口、队列消费、Mini App API、静态资源和定时任务。

```text
POST /webhooks/telegram
POST /webhooks/discord
POST /webhooks/matrix
POST /webhooks/qq
POST /api/mini-app/*
GET /health
```

Telegram webhook 处理规则：

```text
1. 只接受 POST /webhooks/telegram
2. 校验 X-Telegram-Bot-Api-Secret-Token
3. 限制 Content-Type 为 application/json
4. 限制请求体大小
5. 生成 request_id
6. 将原始 Telegram Update 包装成 PlatformEventEnvelope
7. 将 PlatformEventEnvelope 写入 Cloudflare Queue
8. 队列写入成功后立即返回 200
9. 队列写入失败时返回 500，让 Telegram 重试
```

未来平台 webhook 入口只保留路由占位，不实现业务：

```text
POST /webhooks/discord -> 501 Not Implemented
POST /webhooks/matrix -> 501 Not Implemented
POST /webhooks/qq -> 501 Not Implemented
```

### 4.2 Cloudflare Queue: platform-events

队列保存各平台 webhook 入口接收到的平台事件。Cloudflare Workers 的 queue consumer handler 直接消费队列并处理业务：

```text
queue(batch, env, ctx)
```

队列消费者必须实现幂等处理。幂等键使用：

```text
platform + raw_event_id
```

MVP 中：

```text
platform = telegram
raw_event_id = Telegram Update.update_id
```

### 4.3 Worker Application Core

Worker Application Core 是业务大脑。它负责：

```text
解析 PlatformEventEnvelope
将事件分发到对应 platform adapter
调用 core modules 执行平台无关业务
执行入群验证状态机
通过 platform adapter 调用平台 API
处理管理员操作
写入审计日志
使用 Cloudflare Queues 处理异步消息
使用 Cloudflare Cron Triggers 扫描超时验证和观察期
提供 Mini App API
```

所有业务逻辑运行在 Cloudflare Workers 内。D1 是主数据库，Queues 是异步缓冲层，Cron Triggers 负责定时扫描。

## 5. Telegram Bot API 能力映射

本节只描述 TelegramPlatformAdapter 需要实现的 Telegram 专属能力。核心模块不得直接调用 Telegram Bot API。

### 5.1 Webhook

生产环境只使用 Telegram webhook，不使用 long polling。

必须在 `setWebhook` 中设置：

```json
{
  "url": "https://<domain>/webhooks/telegram",
  "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
  "allowed_updates": [
    "message",
    "callback_query",
    "chat_join_request",
    "chat_member",
    "my_chat_member"
  ],
  "drop_pending_updates": false
}
```

文档：

- `setWebhook`: <https://core.telegram.org/bots/api#setwebhook>
- `Update`: <https://core.telegram.org/bots/api#update>

### 5.2 Telegram 公开群入群后验证

MVP 核心平台能力：

```text
message.new_chat_members
chat_member update
restrictChatMember
banChatMember
unbanChatMember
sendMessage
```

Telegram 正式群必须保持公开群。公开群的公开链接允许用户直接加入并发言时，Telegram 不提供稳定的 `chat_join_request` 入群前审批主路径。MVP 因此采用入群后验证：

```text
用户加入公开群
-> Telegram 发送 message.new_chat_members 或 chat_member update
-> bot 完全限制用户发言
-> bot 私聊或群内提示完成验证
-> 验证通过后按风险分流恢复文本权限、进入人工审核或移出群组
-> 24 小时观察期后按社区配置恢复更完整权限
```

Telegram bot 必须是目标群管理员，并至少拥有限制成员、移出成员和发送消息所需权限。为减少骚扰窗口，bot 应在发现新成员后尽快执行限制动作。

TelegramPlatformAdapter 必须将新成员加入事件转换为核心事件：

```text
member.joined
verification.session_created
```

TelegramPlatformAdapter 必须将核心动作转换为 Telegram API 调用：

```text
restrictMember -> restrictChatMember
removeMember -> banChatMember
restoreMember -> restrictChatMember 或 unbanChatMember
sendVerificationMessage -> sendMessage
```

Telegram 的成员权限模型由 `ChatPermissions` 表示。入群后验证不能只抽象为“禁言/解除禁言”一个开关；实现时应明确配置需要关闭或恢复的权限字段，尤其是：

```text
can_send_messages
can_send_audios
can_send_documents
can_send_photos
can_send_videos
can_send_video_notes
can_send_voice_notes
can_send_polls
can_send_other_messages
can_add_web_page_previews
can_react_to_messages
can_edit_tag
can_change_info
can_invite_users
can_pin_messages
can_manage_topics
```

调用 `restrictChatMember` 或 `setChatPermissions` 时应优先使用 `use_independent_chat_permissions = true`，避免 Telegram 按隐含规则把某些权限重新放开。例如 `can_send_other_messages` 和 `can_add_web_page_previews` 可能隐含放开多种发送权限；`can_send_polls` 可能隐含放开 `can_send_messages`。本项目的新成员限制策略应显式关闭发送消息、发送媒体、发送其他消息、网页预览、反应和编辑标签等会影响群内可见行为的权限；验证通过后再恢复到社区配置允许的权限集合。

#### 5.2.1 新人引导与防刷屏策略

MVP 的最高优先级是避免未验证账号在公开群内刷屏。拦截过严或误伤真人可以通过管理员人工恢复处理；拦截不足导致普通成员被刷屏干扰是更高优先级风险。

新人加入后的用户旅程固定为：

```text
用户通过公开链接加入 Telegram 群
-> bot 发现新成员事件
-> bot 尽快完全限制新成员发言
-> bot 引导新成员进入验证
-> 新成员完成验证
-> bot 根据验证结果和风险分类决定恢复文本权限、转人工审核或移出并拉黑
-> 24 小时观察期结束后再按社区配置恢复更完整权限
```

验证前必须完全禁止新人发送任何信息。包括但不限于：

```text
文本
图片
视频
语音
文件
贴纸
GIF / 动画
链接预览
投票
emoji reaction
其他会在群内产生可见内容的消息类型
```

新人可以看到群内历史消息。公开透明和信息传播是社区目标之一，因此“看历史消息”和“发言权限”应分开处理。

验证引导采用 best-effort 私聊优先策略：

```text
1. 如果 bot 能向该用户发送私聊消息，则只在私聊中欢迎新人并提示完成验证。
2. 如果 Telegram 拒绝私聊发送，或用户尚未与 bot 建立私聊会话，则在群内发送短提示，引导用户点击 bot 或验证入口。
3. 群内提示应尽量降低对其他成员的打扰，例如短文本、可删除消息、定时删除、合并提示或限频提示。
4. 如果用户始终不进入 bot 完成验证，则按验证超时处理，不需要管理员即时介入。
```

实现时必须记录私聊发送失败和群内回退提示，但日志不得输出 bot token、webhook secret 或用户提交的完整敏感内容。

#### 5.2.2 MVP 验证题与失败策略

MVP 第一版只实现一个低成本文字验证题。题面和标准答案属于运营配置，不写入公开 spec、代码常量、普通日志或测试快照。

```text
bot 提示：从私有配置读取一条中文短答题题面
期望用户回复：从私有配置读取对应标准答案
```

该验证题的目标不是精确识别真人身份，而是降低骚扰机器人批量进群和立即刷屏的成功率。后续可以替换为 Mini App 表单、Turnstile、人机验证、邀请码或资料收集问卷，但验证方式必须通过 `VerificationChannel` 抽象接入，不应写死在 onboarding 状态机中。

验证时间限制：

```text
新成员加入后 3 分钟内必须完成验证。
超过 3 分钟未完成验证，视为 verification_timeout。
同一账号累计 5 次 verification_timeout 后永久拉黑。
```

验证答题失败限制：

```text
一次验证 session 最多允许 3 次回答。
第 4 次仍未回答正确时，该 session 记为 verification_failed。
同一账号累计 3 次 verification_failed 后永久拉黑。
```

`verification_timeout` 和 `verification_failed` 是不同失败类型，必须分别计数。永久拉黑表示 bot 后续发现该账号加入时应自动移出，不再进入普通验证流程。真人如果被误判，可以联系管理员人工解除。

#### 5.2.3 验证后风险分流与观察期

所有新人都必须参与验证；不存在绕过验证直接进入群聊的普通路径。

验证完成后再进行风险分类。MVP 风险分流规则：

```text
低风险：验证通过后恢复文本发送权限，进入 24 小时观察期。
中风险：验证通过但资料或行为可疑，推送到管理员群人工审核；在管理员批准前仍保持受限。
高风险：即使验证通过，也直接移出群组并永久拉黑。
```

当前经验预期中，新人低/中/高风险比例约为：

```text
低风险 10%
中风险 20%
高风险 70%
```

该比例不是硬编码规则，只用于提醒实现和测试时不要假设“绝大多数新人都会自动通过”。

通过验证后的 24 小时观察期内，用户只允许发送文本消息。观察期结束后恢复哪些权限暂未最终确定，必须通过社区配置控制，不得在代码中写死为“完全恢复所有权限”。MVP 可以先保留 `probation` 状态和恢复任务接口，具体媒体、链接、reaction、投票等权限细分后续再明确。

观察期内如果触发明确违规，MVP 先采用直接移出并记录审计的策略；更细粒度处罚规则留到后续版本。

`chat_join_request`、`ChatJoinRequest`、`approveChatJoinRequest`、`declineChatJoinRequest` 和 Join Request Queries 仍作为 Telegram adapter 的可选能力保留，用于私有群、特殊邀请链接或未来扩展；它们不再是公开群 MVP 主路径。

文档：

- `Message.new_chat_members`: <https://core.telegram.org/bots/api#message>
- `ChatMemberUpdated`: <https://core.telegram.org/bots/api#chatmemberupdated>
- `ChatPermissions`: <https://core.telegram.org/bots/api#chatpermissions>
- `restrictChatMember`: <https://core.telegram.org/bots/api#restrictchatmember>
- `setChatPermissions`: <https://core.telegram.org/bots/api#setchatpermissions>
- `banChatMember`: <https://core.telegram.org/bots/api#banchatmember>
- `unbanChatMember`: <https://core.telegram.org/bots/api#unbanchatmember>
- `sendMessage`: <https://core.telegram.org/bots/api#sendmessage>

### 5.3 Telegram 入群申请可选能力

私有群或带 `creates_join_request` 的特殊邀请链接可以产生 `chat_join_request`。该能力可用于 staging 实验、未来私有群场景或补充入口，但不是正式公开群 MVP 的主流程。

涉及能力：

```text
chat_join_request update
ChatJoinRequest
approveChatJoinRequest
declineChatJoinRequest
ChatInviteLink.creates_join_request
```

文档：

- `chat_join_request` update: <https://core.telegram.org/bots/api#update>
- `ChatJoinRequest`: <https://core.telegram.org/bots/api#chatjoinrequest>
- `approveChatJoinRequest`: <https://core.telegram.org/bots/api#approvechatjoinrequest>
- `declineChatJoinRequest`: <https://core.telegram.org/bots/api#declinechatjoinrequest>
- `ChatInviteLink.creates_join_request`: <https://core.telegram.org/bots/api#chatinvitelink>

### 5.4 Telegram Bot API 10.1 Join Request Queries

Telegram Bot API 10.1 新增 Join Request Queries，用于在决定入群申请结果前展示 Mini App 或直接回答入群申请查询。

该能力属于私有群或特殊邀请链接的可选扩展。MVP 主路径采用公开群入群后验证，但数据模型和服务接口不应把验证方式写死，以便未来复用 Mini App 或 Join Request Queries。

涉及能力：

```text
User.supports_join_request_queries
ChatFullInfo.guard_bot
ChatJoinRequest.query_id
sendChatJoinRequestWebApp
answerChatJoinRequestQuery
```

当 `ChatJoinRequest.query_id` 存在时，TelegramPlatformAdapter 必须在 10 秒内调用：

```text
sendChatJoinRequestWebApp
```

或：

```text
answerChatJoinRequestQuery
```

文档：

- Bot API 10.1 changelog: <https://core.telegram.org/bots/api-changelog#june-11-2026>
- `ChatJoinRequest.query_id`: <https://core.telegram.org/bots/api#chatjoinrequest>
- `sendChatJoinRequestWebApp`: <https://core.telegram.org/bots/api#sendchatjoinrequestwebapp>
- `answerChatJoinRequestQuery`: <https://core.telegram.org/bots/api#answerchatjoinrequestquery>

## 19. Staging smoke test 后续 TODO

为了尽快进入 staging 并在 Telegram 测试群完成真实链路验证，当前 staging smoke test 只要求跑通公开群新人加入、禁言、验证引导、私聊答题、文本观察期、答题失败移出、超时移出和累计失败/超时封禁。以下事项暂不阻塞本次 staging：

1. 实现真实资料风控评分：根据 username、first_name、last_name、bio、Premium、头像、历史失败/超时等信号计算风险分。
2. 建立 `moderation_rules` 或等价配置表：把关键词、阈值、风险分、规则启停从代码和环境变量迁移到数据库配置。
3. 实现中风险管理员审核入口：向 Telegram 管理员群发送审核卡片，支持批准、拒绝和拒绝二次确认。
4. 实现管理员权限校验：所有管理员操作必须按 `platform + platform_account_id` 校验，并记录管理员 ID。
5. 实现群内验证提示的低打扰清理：支持定时删除、合并提示或限频提示，降低对普通成员的打扰。
6. 补齐风险分流审计细节：将风险规则命中项、人工覆盖、管理员拒绝、解除拉黑等写入更完整的审计记录。
7. 实现观察期结束后的权限恢复任务：目前 staging 只要求观察期内文本权限可用，观察期结束后的媒体、链接、reaction 等权限仍需后续明确。
8. 增强 Telegram 资料采集：在 Bot API 能力允许范围内补充用户名、昵称、bio、头像、Premium 等资料同步。
9. 增强外部 API 失败追踪：Telegram API 调用失败需要可查询的失败状态、告警或后台排查入口。
10. 补充 Discord、QQ、Matrix adapter 的实际平台映射；当前只保留跨平台架构边界和入口。
- `ChatFullInfo.guard_bot`: <https://core.telegram.org/bots/api#chatfullinfo>

### 5.5 Telegram Mini App

Mini App 用于后续增强 Telegram 验证、问卷、资料收集和活动报名。MVP 中只建立基础壳与 init data 校验。

Mini App 必须校验 Telegram WebApp init data。所有用户身份以服务端校验结果为准。

文档：

- Telegram Mini Apps: <https://core.telegram.org/bots/webapps>
- Validating data received via Mini App: <https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app>

## 6. 模块边界

目录结构固定为：

```text
apps/
  worker/
    src/
  mini-app/
    src/

packages/
  shared/
    src/
  db/
    src/
  platform-contracts/
    src/
      core/
      telegram/
      discord/
      matrix/
      qq/
```

Worker 内部结构：

```text
apps/worker/src/
  app/
    config/
    logger/
    errors/
    di/
  adapters/
    telegram/
      bot.ts
      api.ts
      mapper.ts
      middlewares/
      keyboards/
    discord/
      README.md
    matrix/
      README.md
    qq/
      README.md
  core/
    platform-events/
    platform-actions/
  http/
    routes/
    middlewares/
  queue/
    consumer.ts
  cron/
    scheduled.ts
  modules/
    onboarding/
      handlers/
      services/
      policies/
      tasks/
      schemas/
    moderation/
    profiles/
    admin/
    content/
    notifications/
    surveys/
  platform/
    db/
    queue/
    r2/
    turnstile/
  shared/
    events/
    utils/
```

MVP 实现模块：

```text
onboarding
moderation
profiles
admin
notifications
content
```

`surveys` 只保留目录、接口占位和迁移预留，不实现业务。

平台 adapter MVP 状态：

```text
telegram: implemented
discord: placeholder only
matrix: placeholder only
qq: placeholder only
```

## 7. 领域模型

### 7.1 成员状态机

统一成员状态：

```text
visitor
applied
verification_pending
verification_passed
manual_review
approved
joined
probation
member
restricted
rejected
banned
left
```

状态流转：

```text
visitor
  -> applied
  -> verification_pending
  -> verification_passed
  -> approved
  -> joined
  -> probation
  -> member

applied
  -> manual_review
  -> approved
  -> rejected

verification_pending
  -> verification_passed
  -> manual_review
  -> rejected

member
  -> restricted
  -> left
  -> banned
```

每一次状态变化必须写入 `audit_logs`。

### 7.2 MVP: Telegram 公开群入群后验证流程

```text
1. 用户通过公开群入口加入 Telegram 群
2. Worker 校验 secret 并写入 Cloudflare Queue
3. Worker queue consumer 从 Cloudflare Queue 消费 PlatformEventEnvelope
4. Worker 以 platform + raw_event_id 幂等写入 D1
5. TelegramPlatformAdapter 将 message.new_chat_members 或 chat_member update 映射为 member.joined
6. profiles 模块 upsert user、platform_account 与 community_member
7. onboarding 模块创建 verification_session
8. TelegramPlatformAdapter 调用 restrictChatMember 完全限制新成员发言
9. onboarding 模块通过私聊优先、群内回退的方式发送验证引导
10. 用户在 3 分钟内回答 MVP 验证题
11. 验证失败或超时达到阈值时触发 removeMember 与 banMember
12. 验证通过后 moderation 模块计算 risk_score
13. low risk：进入 probation，仅恢复文本发送权限
14. medium risk：进入 manual_review，向管理员群发送审核卡片，继续保持受限
15. high risk：触发 removeMember 与 banMember
16. 管理员批准 medium risk 用户后，进入 probation，仅恢复文本发送权限
17. 管理员拒绝 medium risk 用户后，移出群组并永久拉黑
18. 24 小时观察期结束后，根据社区配置恢复更完整权限
19. 所有状态变化、自动决策和管理员操作写入 audit_logs
```

MVP 中 `JoinApplication` 仍作为平台无关模型保留，用于兼容私有群、未来平台或特殊邀请链接；但 Telegram 公开群主路径应以 `member.joined` 和 `verification_session` 为核心，不应要求用户先提交入群申请。

### 7.3 验证方式抽象

验证方式是可替换策略，接口固定为：

```ts
interface VerificationChannel {
  createSession(input: CreateVerificationSessionInput): Promise<VerificationSession>;
  sendChallenge(sessionId: string): Promise<void>;
  resolve(sessionId: string, result: VerificationResult): Promise<void>;
}
```

MVP 实现：

```text
DirectMessageVerificationChannel
```

预留实现：

```text
JoinRequestQueryMiniAppVerificationChannel
MiniAppVerificationChannel
InviteCodeVerificationChannel
```

## 8. 风险评分

风险评分由 `moderation` 模块提供。

输入：

```text
platform
platform_account_id
username
first_name
last_name
bio
is_premium
has_avatar
invite_link_id
request_timestamp
past_join_application_count
past_verification_timeout_count
past_verification_failed_count
past_rejection_count
past_ban_count
source_risk_level
current_request_rate
verification_result
```

输出：

```ts
type RiskLevel = 'low' | 'medium' | 'high';
type RecommendedAction = 'approve' | 'verify' | 'review' | 'decline';

interface RiskDecision {
  score: number;
  level: RiskLevel;
  reasons: string[];
  recommendedAction: RecommendedAction;
}
```

第一版规则：

```text
自动拒绝：
- 用户在 banned_users 中
- 同一用户重复失败超过配置阈值
- invite_source 被标记为 blocked
- username / first_name / last_name / bio 命中 blocklist 高危词
- 验证通过后仍命中高风险骚扰特征组合

进入观察期：
- 用户完成验证
- 风险分低于 manual_review_threshold
- 未命中自动拒绝规则

进入人工审核：
- 用户完成验证
- 风险分处于中风险区间
- 命中可疑但不足以自动拒绝的资料特征

永久拉黑：
- verification_failed 累计达到 3 次
- verification_timeout 累计达到 5 次
- 高风险用户被自动移出
- 管理员拒绝中风险用户
```

所有规则保存在数据库表 `moderation_rules`，不硬编码在 handler 中。

第一版重点关注以下高风险资料特征，但具体词库和分值必须配置化：

```text
Telegram Premium 账号
bio、first_name、last_name、username 中包含项目、金钱、链接、拉群、营销等相关措辞
使用同音、近形、拆字或变体规避关键词，例如“裙”替代“群”
短时间重复加入、重复验证失败或重复验证超时
```

不应简单把无头像、无 bio 当作唯一高风险依据。骚扰账号可能具有真人头像、真实姓名或 Premium 标记；正常用户也可能资料很少。

MVP 不维护不断膨胀的黑白名单和可信来源名单。系统必须保留 `banned_users` 或等价的封禁记录，用于永久拉黑和管理员解除封禁；其他 allowlist、trusted invite source 可以保留模型入口，但不作为第一版主流程依赖。

## 9. 管理员审核

管理员操作入口：

```text
/admin
/pending
审核群中的 inline keyboard
```

审核卡片字段：

```text
昵称
username
bio
platform
platform_account_id
申请群
来源邀请链接
申请时间
风险等级
风险原因
验证状态
历史申请次数
历史验证失败次数
历史验证超时次数
历史拒绝次数
```

操作按钮：

```text
批准
拒绝
查看详情
```

管理员权限按 `platform + platform_account_id` 校验。MVP 中只实现 Telegram 管理员账号校验。管理员列表来自数据库配置，不从环境变量硬编码。

高危操作必须二次确认：

```text
拒绝并永久拉黑中风险用户
```

管理员拒绝不强制填写原因，但必须记录执行管理员的 `platform + platform_account_id`、操作时间、目标用户和操作结果。未来需要追溯时，可以根据管理员 ID 找到人工负责人。

MVP 审核入口优先使用 Telegram 管理员群，因为管理员需要互相讨论。管理员与 bot 的私聊入口作为次要入口；Web 管理台或 Mini App 管理界面留到后续版本。

## 10. 数据库表

MVP 必建表：

```text
users
platform_accounts
communities
community_members
join_applications
verification_sessions
verification_answers
invite_sources
moderation_rules
risk_events
admin_users
admin_actions
audit_logs
app_settings
platform_events
outbox_events
```

未来预留表：

```text
surveys
survey_questions
survey_responses
member_profile_fields
member_profile_values
activities
activity_registrations
uploaded_files
notifications
```

关键约束：

```text
platform_accounts 同一 platform + platform_user_id 唯一
platform_events 同一 platform + raw_event_id 唯一
join_applications 同一 community_id + platform_account_id + pending 状态只能存在一条
audit_logs append-only
admin_actions append-only
```

所有平台用户 ID、群组 ID、频道 ID、房间 ID 都以字符串存储，避免跨平台格式差异和整数精度问题。Telegram 用户 ID 和 chat ID 作为 `platform_accounts.platform_user_id`、`communities.platform_resource_id` 或 adapter 原始载荷字段保存。

## 11. 事件系统

使用数据库 outbox pattern。业务事务中写入 `outbox_events`，后台 worker 读取并投递。

事件命名：

```text
join_application.created
join_application.risk_scored
verification.session_created
verification.completed
verification.failed
verification.timeout
member.approved
member.rejected
member.joined
member.restricted
member.removed
member.banned
member.probation_started
member.probation_finished
admin.action_created
```

新增模块只能订阅事件，不直接修改 onboarding 主流程。

## 12. 后台任务

后台任务由 Cloudflare Queues 和 Cloudflare Cron Triggers 共同承担。

Cloudflare Queues：

```text
platform-send
audit-outbox
notifications
exports
```

Cloudflare Cron Triggers：

```text
verification-timeout-scan
probation-scan
outbox-dispatch-scan
cleanup-scan
```

所有异步任务必须满足：

```text
幂等
可重试
失败写日志
不依赖内存状态
```

MVP 必做任务：

```text
Cron 扫描验证超时并自动移出或永久拉黑
Telegram 消息发送重试
outbox event 分发
Cron 扫描观察期结束并更新状态
```

## 13. 配置

配置来自数据库 `app_settings`，环境变量只保存密钥和部署环境。

环境变量：

```text
APP_ENV
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
CLOUDFLARE_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
TURNSTILE_SECRET_KEY
```

Cloudflare 绑定：

```text
DB: D1Database
PLATFORM_EVENTS: Queue
ASSETS: Fetcher
R2_BUCKET: R2Bucket
```

数据库配置：

```text
default_community_id
telegram_target_chat_id
telegram_review_chat_id
admin_platform_accounts
verification_timeout_minutes
probation_minutes
auto_approve_threshold
manual_review_threshold
blocked_keywords
verification_questions
verification_answer_max_attempts
verification_failed_ban_threshold
verification_timeout_ban_threshold
probation_text_only_minutes
telegram_group_prompt_delete_seconds
```

MVP 默认配置：

```text
verification_timeout_minutes = 3
verification_answer_max_attempts = 3
verification_failed_ban_threshold = 3
verification_timeout_ban_threshold = 5
probation_text_only_minutes = 1440
```

`trusted_invite_links`、`high_risk_invite_links`、allowlist 等能力可保留数据模型入口，但 MVP 主流程不依赖它们。当前社区主要使用公共群链接，没有可信来源分流。

## 14. 安全要求

```text
Telegram bot token 只能存在 secret/env
Telegram webhook 必须校验 X-Telegram-Bot-Api-Secret-Token
Queue consumer 只能处理来自 PLATFORM_EVENTS 绑定的消息
Mini App init data 必须服务端校验
管理员权限必须按 platform + platform_account_id 校验
R2 bucket 默认私有
导出文件必须有过期时间
日志不得打印 bot token、webhook secret、完整手机号、完整邮箱或完整用户提交资料
所有自动拒绝必须记录规则原因
所有人工覆盖必须记录管理员 platform_account_id
```

日志与审计补充要求：

```text
用户加入、被限制、验证开始、验证通过、验证失败、验证超时、风险分流、管理员批准、管理员拒绝、移出、拉黑、解除拉黑、权限恢复都必须记录审计。
验证答案、手机号、邮箱、真实姓名、未来资料表单中的敏感答案不得写入普通日志。
审计日志可以保存 platform_user_id / platform_account_id，用于区分用户和追溯历史。
管理员可以查看用户历史加入次数、验证失败次数、验证超时次数、拒绝次数和拉黑状态。
MVP 阶段审计日志永久保存；后续系统成熟后再评估改为 365 天或按类型分级保留。
```

## 15. MVP 范围

P0：

```text
monorepo 初始化
Cloudflare Worker app
Cloudflare Queue platform-events
Worker queue consumer
Hono 路由
Telegram adapter grammY 初始化
setWebhook 脚本
D1 schema
Drizzle migration
platform_events 幂等入库
Telegram 新成员加入事件接收
新成员完全限制发言
MVP 文字验证题
验证失败与验证超时计数
验证通过后文本权限恢复与 24 小时观察期
高风险或达到失败阈值时移出并永久拉黑
审计日志
```

P1：

```text
风险评分
私聊优先、群内回退的验证引导
验证超时任务
自动移出 / 拉黑
管理员审核卡片
管理员权限配置
```

P2：

```text
观察期结束后的细粒度权限恢复
Mini App 壳
Telegram WebApp init data 校验
Turnstile 接入
邀请链接来源分析
Join Request Queries 接口预留
```

P3：

```text
chat_join_request 可选入口
sendChatJoinRequestWebApp
answerChatJoinRequestQuery
资料收集模块
问卷模块
通知模块
R2 文件上传
```

第一阶段不实现：

```text
AI 风险识别
支付
多社区 SaaS
复杂 Web 管理台
公开 API
积分系统
```

## 16. 工程约束

```text
Platform adapter handler 必须薄，业务逻辑写在 service
模块之间只能通过 service 或 event 交互
禁止跨模块直接读写内部表
所有状态变化必须写 audit_logs
所有 Telegram API 调用封装在 adapters/telegram/api.ts
所有 Cloudflare 绑定封装在 platform/cloudflare
所有外部请求必须有 timeout
所有数据库写入路径必须可测试
所有后台任务必须幂等
```

跨平台抽象约束：

```text
核心流程使用“已加入但未验证”的 onboarding 模型，不能把 Telegram 公开群路径表达成必须先申请入群。
核心动作使用 restrictMember、restoreMember、removeMember、banMember、sendVerificationPrompt 等平台中立动作。
Telegram adapter 将这些动作映射为 restrictChatMember、banChatMember、unbanChatMember、sendMessage。
Discord、QQ 等未来平台可以按各自机制映射为身份组、timeout、禁言、移出、审核或其他平台能力，不要求用户体验与 Telegram 完全一致。
不同平台身份暂不自动绑定；未来如需跨平台身份关联，必须由用户主动开启。
当前支持单社区多平台资源：Telegram 频道及关联群、Telegram 管理员群、QQ 群、Discord server/channel。实现时不应要求普通用户加入多个群才能完成基础交流。
```

## 17. 验收标准

MVP 完成时必须满足：

```text
1. Telegram webhook 能稳定接收 update
2. 非法 webhook secret 请求被拒绝
3. Telegram 新成员加入事件被映射为成员验证流程，且不会重复处理
4. 新成员加入后会被完全限制发言，不能发送任何群内可见内容
5. bot 优先私聊发送验证引导，私聊失败时回退为低打扰群内提示
6. 新成员能在 3 分钟内通过私有配置中的中文短答题完成 MVP 验证
7. 单次验证 session 第 4 次错误回答会记为 verification_failed
8. 同一账号累计 3 次 verification_failed 后永久拉黑
9. 同一账号累计 5 次 verification_timeout 后永久拉黑
10. 验证通过后进行风险分流：低风险进入 24 小时文本观察期，中风险进入管理员审核，高风险移出并拉黑
11. 管理员可在审核群批准或拒绝中风险用户，拒绝必须二次确认
12. 观察期内用户仅可发送文本消息
13. 每次状态变化、自动决策和管理员操作都有 audit log
14. Worker 重新部署或短暂失败不会丢失待验证成员状态
15. TelegramPlatformAdapter 调用 Telegram API 失败会重试或记录可追踪失败状态
16. 配置项不写死在代码中
```

## 18. 文档索引

Telegram：

- Bot API: <https://core.telegram.org/bots/api>
- Bot API changelog: <https://core.telegram.org/bots/api-changelog>
- `setWebhook`: <https://core.telegram.org/bots/api#setwebhook>
- `Update`: <https://core.telegram.org/bots/api#update>
- `ChatJoinRequest`: <https://core.telegram.org/bots/api#chatjoinrequest>
- `approveChatJoinRequest`: <https://core.telegram.org/bots/api#approvechatjoinrequest>
- `declineChatJoinRequest`: <https://core.telegram.org/bots/api#declinechatjoinrequest>
- `ChatMemberUpdated`: <https://core.telegram.org/bots/api#chatmemberupdated>
- `ChatPermissions`: <https://core.telegram.org/bots/api#chatpermissions>
- `restrictChatMember`: <https://core.telegram.org/bots/api#restrictchatmember>
- `setChatPermissions`: <https://core.telegram.org/bots/api#setchatpermissions>
- `banChatMember`: <https://core.telegram.org/bots/api#banchatmember>
- `unbanChatMember`: <https://core.telegram.org/bots/api#unbanchatmember>
- `sendChatJoinRequestWebApp`: <https://core.telegram.org/bots/api#sendchatjoinrequestwebapp>
- `answerChatJoinRequestQuery`: <https://core.telegram.org/bots/api#answerchatjoinrequestquery>
- Mini Apps: <https://core.telegram.org/bots/webapps>

Cloudflare：

- Workers: <https://developers.cloudflare.com/workers/>
- Workers Runtime APIs: <https://developers.cloudflare.com/workers/runtime-apis/>
- Workers Static Assets: <https://developers.cloudflare.com/workers/static-assets/>
- D1: <https://developers.cloudflare.com/d1/>
- Queues: <https://developers.cloudflare.com/queues/>
- Cron Triggers: <https://developers.cloudflare.com/workers/configuration/cron-triggers/>
- R2: <https://developers.cloudflare.com/r2/>
- Turnstile: <https://developers.cloudflare.com/turnstile/>
- Wrangler: <https://developers.cloudflare.com/workers/wrangler/>

TypeScript stack：

- TypeScript: <https://www.typescriptlang.org/>
- Hono: <https://hono.dev/>
- grammY: <https://grammy.dev/>
- Drizzle ORM: <https://orm.drizzle.team/>
- Vitest: <https://vitest.dev/>
