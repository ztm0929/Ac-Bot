export type TelegramUpdateId = number;

export type TelegramChatId = string;

export type TelegramUserId = string;

export type TelegramChatJoinRequest = {
  chat: {
    id: number | string;
  };
  from: {
    id: number | string;
  };
  date: number;
  invite_link?: {
    invite_link?: string;
  };
};

export type TelegramMessage = {
  message_id: number;
  chat: {
    id: number | string;
  };
  from?: {
    id: number | string;
  };
  text?: string;
};

export type TelegramWebhookUpdate = {
  update_id: TelegramUpdateId;
  chat_join_request?: TelegramChatJoinRequest;
  message?: TelegramMessage;
  [key: string]: unknown;
};
