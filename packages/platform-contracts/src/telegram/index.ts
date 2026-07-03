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

export type TelegramChat = {
  id: number | string;
};

export type TelegramUser = {
  id: number | string;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramMessage = {
  message_id: number;
  date: number;
  chat: TelegramChat;
  new_chat_members?: TelegramUser[];
};

export type TelegramChatMemberStatus =
  | 'creator'
  | 'administrator'
  | 'member'
  | 'restricted'
  | 'left'
  | 'kicked';

export type TelegramChatMember = {
  status: TelegramChatMemberStatus;
  user: TelegramUser;
  is_member?: boolean;
};

export type TelegramChatMemberUpdated = {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  old_chat_member: TelegramChatMember;
  new_chat_member: TelegramChatMember;
};

export type TelegramWebhookUpdate = {
  update_id: TelegramUpdateId;
  chat_join_request?: TelegramChatJoinRequest;
  message?: TelegramMessage;
  chat_member?: TelegramChatMemberUpdated;
  [key: string]: unknown;
};
