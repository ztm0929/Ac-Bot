# Ac-Bot

Ac-Bot 是一个社群专属的跨平台机器人系统，用于成员入群/入服审核、验证、风控、问卷、资料收集、互动和后续社区工作流。

当前 MVP 聚焦 Telegram 入群申请验证与审批。架构采用“平台无关核心 + 平台适配器”的方式设计，后续可以继续接入 QQ、Discord、Matrix，而不需要拆分多个代码仓库。

## 当前范围

- Telegram 入群申请接收与审批流程
- 风险评分与新人验证流程设计
- 管理员审核与审计记录设计
- 基于 Cloudflare Workers、D1、Queues、R2、Turnstile、Workers Static Assets 的运行方案

## 规格文档

初始开发规格：

- [0001-community-bot-platform-mvp.md](docs/specs/0001-community-bot-platform-mvp.md)

规格文档是长期维护的项目文档，不在实现完成后删除。小修正可以直接更新当前规格；较大的新功能应新增编号规格文档。

## 部署环境

项目使用 staging 与 production 两套环境。新功能应先部署到 staging，在测试 bot 与测试群中完成体验，再部署到 production。

- [部署环境说明](docs/deployment-environments.md)
