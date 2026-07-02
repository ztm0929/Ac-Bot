export type TelegramUpdateId = number;

export type TelegramChatId = string;

export type TelegramUserId = string;

export type TelegramWebhookUpdate = {
  update_id: TelegramUpdateId;
  [key: string]: unknown;
};
