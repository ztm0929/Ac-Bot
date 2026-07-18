import type {
  ApproveJoinApplicationInput,
  BanMemberInput,
  DirectMessageInput,
  MessageTextFormat,
  RejectJoinApplicationInput,
  RemoveMemberInput,
  RestoreMemberInput,
  RestrictMemberInput,
  UnbanMemberInput,
  VerificationPromptDelivery,
  VerificationPromptInput,
} from '@ac-bot/platform-contracts/core';

const telegramApiTimeoutMs = 10_000;

const defaultFetch: typeof fetch = (input, init) => {
  return fetch(input, init);
};

type TelegramApiResponse = {
  ok: boolean;
  description?: string;
};

type TelegramChatPermissions = {
  can_send_messages?: boolean;
  can_send_audios?: boolean;
  can_send_documents?: boolean;
  can_send_photos?: boolean;
  can_send_videos?: boolean;
  can_send_video_notes?: boolean;
  can_send_voice_notes?: boolean;
  can_send_polls?: boolean;
  can_send_other_messages?: boolean;
  can_add_web_page_previews?: boolean;
  can_react_to_messages?: boolean;
  can_change_info?: boolean;
  can_invite_users?: boolean;
  can_pin_messages?: boolean;
  can_manage_topics?: boolean;
};

type TelegramRequestBody = {
  chat_id: number | string;
  text?: string;
  rich_message?: TelegramInputRichMessage;
  user_id: number;
  permissions?: TelegramChatPermissions;
  use_independent_chat_permissions?: boolean;
  revoke_messages?: boolean;
  only_if_banned?: boolean;
};

type TelegramInputRichMessage =
  | {
      markdown: string;
    }
  | {
      html: string;
    };

type TelegramTextMessageRequest = {
  method: 'sendMessage' | 'sendRichMessage';
  body: Pick<TelegramRequestBody, 'chat_id' | 'text' | 'rich_message'>;
};

const escapeRichHtmlText = (text: string): string => {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
};

const createTelegramRichMessage = (
  text: string,
  format: Exclude<MessageTextFormat, 'plain_text'>,
): TelegramInputRichMessage => {
  switch (format) {
    case 'markdown':
      return { markdown: text };
    case 'html':
      return { html: text };
    case 'latex_inline':
      return { html: `<tg-math>${escapeRichHtmlText(text)}</tg-math>` };
    case 'latex_block':
      return { html: `<tg-math-block>${escapeRichHtmlText(text)}</tg-math-block>` };
  }
};

export class TelegramApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelegramApiError';
  }
}

const isTelegramApiResponse = (input: unknown): input is TelegramApiResponse => {
  return (
    typeof input === 'object' &&
    input !== null &&
    'ok' in input &&
    typeof input.ok === 'boolean' &&
    (!('description' in input) || typeof input.description === 'string')
  );
};

const toTelegramChatId = (communityId: string): number | string => {
  const numericId = Number(communityId);

  // 核心层统一把平台资源 ID 存成字符串；调用 Telegram API 时再恢复可安全表达的数字 ID。
  if (Number.isSafeInteger(numericId) && String(numericId) === communityId) {
    return numericId;
  }

  return communityId;
};

const toTelegramUserId = (platformAccountId: string): number => {
  const userId = Number(platformAccountId);

  // Telegram Bot API 的 user_id 必须是数字；不能安全还原时直接失败，避免审批打到错误账号。
  if (!Number.isSafeInteger(userId) || String(userId) !== platformAccountId) {
    throw new TelegramApiError('Telegram 用户 ID 必须是安全整数');
  }

  return userId;
};

const createRequestBody = (
  input:
    | ApproveJoinApplicationInput
    | RejectJoinApplicationInput
    | RestrictMemberInput
    | RestoreMemberInput
    | RemoveMemberInput
    | BanMemberInput
    | UnbanMemberInput,
): Pick<TelegramRequestBody, 'chat_id' | 'user_id'> => {
  if (input.platform !== 'telegram') {
    throw new TelegramApiError('Telegram adapter 只能处理 telegram 平台动作');
  }

  return {
    chat_id: toTelegramChatId(input.communityId),
    user_id: toTelegramUserId(input.platformAccountId),
  };
};

const createTextMessageRequest = (
  chatId: number | string,
  text: string,
  format: MessageTextFormat = 'plain_text',
): TelegramTextMessageRequest => {
  if (format === 'plain_text') {
    return {
      method: 'sendMessage',
      body: {
        chat_id: chatId,
        text,
      },
    };
  }

  return {
    method: 'sendRichMessage',
    body: {
      chat_id: chatId,
      rich_message: createTelegramRichMessage(text, format),
    },
  };
};

const createDirectMessageRequest = (input: DirectMessageInput): TelegramTextMessageRequest => {
  if (input.platform !== 'telegram') {
    throw new TelegramApiError('Telegram adapter 只能处理 telegram 平台动作');
  }

  return createTextMessageRequest(toTelegramUserId(input.platformAccountId), input.text, input.format);
};

const createVerificationPromptDirectMessageRequest = (
  input: VerificationPromptInput,
): TelegramTextMessageRequest => {
  if (input.platform !== 'telegram') {
    throw new TelegramApiError('Telegram adapter 只能处理 telegram 平台动作');
  }

  return createTextMessageRequest(
    toTelegramUserId(input.platformAccountId),
    input.directMessageText,
    input.directMessageFormat,
  );
};

const createVerificationPromptGroupMessageRequest = (
  input: VerificationPromptInput,
): TelegramTextMessageRequest => {
  if (input.platform !== 'telegram') {
    throw new TelegramApiError('Telegram adapter 只能处理 telegram 平台动作');
  }

  return createTextMessageRequest(
    toTelegramChatId(input.communityId),
    input.groupFallbackText,
    input.groupFallbackFormat,
  );
};

const verificationLockedPermissions = (): TelegramChatPermissions => ({
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
  can_react_to_messages: false,
  can_change_info: false,
  can_invite_users: false,
  can_pin_messages: false,
  can_manage_topics: false,
});

const probationTextOnlyPermissions = (): TelegramChatPermissions => ({
  can_send_messages: true,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
  can_react_to_messages: false,
  can_change_info: false,
  can_invite_users: false,
  can_pin_messages: false,
  can_manage_topics: false,
});

const createRestrictMemberRequestBody = (input: RestrictMemberInput): TelegramRequestBody => {
  const body = createRequestBody(input);

  return {
    ...body,
    permissions:
      input.mode === 'verification_locked' ? verificationLockedPermissions() : probationTextOnlyPermissions(),
    use_independent_chat_permissions: true,
  };
};

const createRestoreMemberRequestBody = (input: RestoreMemberInput): TelegramRequestBody => {
  const body = createRequestBody(input);

  return {
    ...body,
    permissions: probationTextOnlyPermissions(),
    use_independent_chat_permissions: true,
  };
};

const createBanMemberRequestBody = (input: RemoveMemberInput | BanMemberInput): TelegramRequestBody => {
  const body = createRequestBody(input);

  return {
    ...body,
    revoke_messages: false,
  };
};

const createUnbanMemberRequestBody = (input: RemoveMemberInput | UnbanMemberInput): TelegramRequestBody => {
  const body = createRequestBody(input);

  return {
    ...body,
    only_if_banned: true,
  };
};

export class TelegramPlatformApi {
  constructor(
    private readonly botToken: string,
    private readonly fetchImpl: typeof fetch = defaultFetch,
  ) {}

  async approveJoinApplication(input: ApproveJoinApplicationInput): Promise<void> {
    await this.request('approveChatJoinRequest', createRequestBody(input));
  }

  async rejectJoinApplication(input: RejectJoinApplicationInput): Promise<void> {
    await this.request('declineChatJoinRequest', createRequestBody(input));
  }

  async sendDirectMessage(input: DirectMessageInput): Promise<void> {
    const request = createDirectMessageRequest(input);
    await this.request(request.method, request.body);
  }

  async sendVerificationPrompt(input: VerificationPromptInput): Promise<VerificationPromptDelivery> {
    const directMessageRequest = createVerificationPromptDirectMessageRequest(input);

    try {
      await this.request(directMessageRequest.method, directMessageRequest.body);

      return 'direct_message';
    } catch (error) {
      if (!(error instanceof TelegramApiError)) {
        throw error;
      }

      // Telegram bot 不能随意主动私聊未打开过 bot 的用户；失败时回退到群内短提示。
      // 群内提示失败则继续抛出，让队列重试，避免新人被禁言后完全收不到验证入口。
      const groupMessageRequest = createVerificationPromptGroupMessageRequest(input);
      await this.request(groupMessageRequest.method, groupMessageRequest.body);

      return 'group_fallback';
    }
  }

  async restrictMember(input: RestrictMemberInput): Promise<void> {
    await this.request('restrictChatMember', createRestrictMemberRequestBody(input));
  }

  async restoreMember(input: RestoreMemberInput): Promise<void> {
    await this.request('restrictChatMember', createRestoreMemberRequestBody(input));
  }

  async removeMember(input: RemoveMemberInput): Promise<void> {
    await this.request('banChatMember', createBanMemberRequestBody(input));
    // Telegram 没有单独的 kick 方法；先 ban 再 unban 可以把成员移出，同时允许后续重新加入。
    await this.request('unbanChatMember', createUnbanMemberRequestBody(input));
  }

  async banMember(input: BanMemberInput): Promise<void> {
    await this.request('banChatMember', createBanMemberRequestBody(input));
  }

  async unbanMember(input: UnbanMemberInput): Promise<void> {
    await this.request('unbanChatMember', createUnbanMemberRequestBody(input));
  }

  private async request(
    method: string,
    body: Pick<TelegramRequestBody, 'chat_id' | 'text' | 'rich_message'> | TelegramRequestBody,
  ): Promise<void> {
    const abortController = new AbortController();
    // 外部平台请求不能无限挂起；超时后交给后续调用方按失败路径处理和重试。
    const timeout = setTimeout(() => abortController.abort(), telegramApiTimeoutMs);

    try {
      const response = await this.fetchImpl(`https://api.telegram.org/bot${this.botToken}/${method}`, {
        method: 'POST',
        signal: abortController.signal,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const responseBody = await response.json();

      if (!isTelegramApiResponse(responseBody)) {
        throw new TelegramApiError('Telegram API 返回了无法识别的响应');
      }

      if (!response.ok || !responseBody.ok) {
        throw new TelegramApiError(responseBody.description ?? 'Telegram API 请求失败');
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
