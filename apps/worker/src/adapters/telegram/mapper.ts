import type { PlatformEventEnvelope } from '@ac-bot/platform-contracts/core';
import type { TelegramWebhookUpdate } from '@ac-bot/platform-contracts/telegram';

const telegramUpdateEventType = 'telegram.update.received';

export const isTelegramWebhookUpdate = (input: unknown): input is TelegramWebhookUpdate => {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const updateId = (input as { update_id?: unknown }).update_id;

  return Number.isInteger(updateId) && Number(updateId) >= 0;
};

export const createTelegramPlatformEventEnvelope = (
  update: TelegramWebhookUpdate,
  receivedAt: string,
): PlatformEventEnvelope<TelegramWebhookUpdate> => {
  return {
    platform: 'telegram',
    eventType: telegramUpdateEventType,
    rawEventId: String(update.update_id),
    receivedAt,
    payload: update,
  };
};
