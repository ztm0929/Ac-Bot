import type {
  CoreEventEnvelope,
  JoinApplicationCreatedPayload,
  PlatformEventEnvelope,
} from '@ac-bot/platform-contracts/core';
import type { TelegramChatJoinRequest, TelegramWebhookUpdate } from '@ac-bot/platform-contracts/telegram';

const telegramUpdateEventType = 'telegram.update.received';
const joinApplicationCreatedEventType = 'join_application.created';

const isRecord = (input: unknown): input is Record<string, unknown> => {
  return typeof input === 'object' && input !== null;
};

const hasTelegramId = (input: unknown): input is number | string => {
  return (typeof input === 'number' && Number.isInteger(input)) || typeof input === 'string';
};

export const isTelegramWebhookUpdate = (input: unknown): input is TelegramWebhookUpdate => {
  if (!isRecord(input)) {
    return false;
  }

  const updateId = input.update_id;

  return Number.isInteger(updateId) && Number(updateId) >= 0;
};

export const isTelegramChatJoinRequest = (input: unknown): input is TelegramChatJoinRequest => {
  if (!isRecord(input) || !isRecord(input.chat) || !isRecord(input.from)) {
    return false;
  }

  return hasTelegramId(input.chat.id) && hasTelegramId(input.from.id) && Number.isInteger(input.date);
};

export const isTelegramChatJoinRequestUpdate = (
  update: TelegramWebhookUpdate,
): update is TelegramWebhookUpdate & { chat_join_request: TelegramChatJoinRequest } => {
  return isTelegramChatJoinRequest(update.chat_join_request);
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

export const createJoinApplicationCreatedEventFromTelegramUpdate = (
  update: TelegramWebhookUpdate,
  occurredAt: string,
): CoreEventEnvelope<JoinApplicationCreatedPayload> | undefined => {
  if (!isTelegramChatJoinRequestUpdate(update)) {
    return undefined;
  }

  const request = update.chat_join_request;
  const applicationId = `telegram:${update.update_id}`;
  const sourceId = request.invite_link?.invite_link;
  const payload: JoinApplicationCreatedPayload = {
    platform: 'telegram',
    platformAccountId: String(request.from.id),
    communityId: String(request.chat.id),
    applicationId,
  };

  if (sourceId) {
    payload.sourceId = sourceId;
  }

  return {
    eventId: `${applicationId}:join_application.created`,
    eventType: joinApplicationCreatedEventType,
    occurredAt,
    payload,
  };
};
