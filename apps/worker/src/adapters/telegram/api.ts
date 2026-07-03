import type {
  ApproveJoinApplicationInput,
  RejectJoinApplicationInput,
} from '@ac-bot/platform-contracts/core';

const telegramApiTimeoutMs = 10_000;

type TelegramApiResponse = {
  ok: boolean;
  description?: string;
};

type TelegramRequestBody = {
  chat_id: number | string;
  user_id: number;
};

type TelegramSendMessageBody = {
  chat_id: number | string;
  text: string;
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
  input: ApproveJoinApplicationInput | RejectJoinApplicationInput,
): TelegramRequestBody => {
  if (input.platform !== 'telegram') {
    throw new TelegramApiError('Telegram adapter 只能处理 telegram 平台动作');
  }

  return {
    chat_id: toTelegramChatId(input.communityId),
    user_id: toTelegramUserId(input.platformAccountId),
  };
};

export class TelegramPlatformApi {
  constructor(
    private readonly botToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async approveJoinApplication(input: ApproveJoinApplicationInput): Promise<void> {
    await this.request('approveChatJoinRequest', createRequestBody(input));
  }

  async rejectJoinApplication(input: RejectJoinApplicationInput): Promise<void> {
    await this.request('declineChatJoinRequest', createRequestBody(input));
  }

  async sendMessage(input: TelegramSendMessageBody): Promise<void> {
    await this.request('sendMessage', input);
  }

  private async request(method: string, body: TelegramRequestBody | TelegramSendMessageBody): Promise<void> {
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
