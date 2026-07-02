# Telegram 契约

Telegram 专属类型应放在这里，或放在 `apps/worker/src/adapters/telegram/` 中。

核心模块必须依赖 `src/core` 中的平台无关契约，不要直接导入 Telegram Bot API 或 grammY 类型。
