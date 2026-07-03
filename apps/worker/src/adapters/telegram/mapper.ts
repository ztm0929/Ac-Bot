import type {
  CoreEventEnvelope,
  JoinApplicationCreatedPayload,
  MemberJoinedPayload,
  PlatformEventEnvelope,
} from '@ac-bot/platform-contracts/core';
import type {
  TelegramChatMember,
  TelegramChatMemberStatus,
  TelegramChatMemberUpdated,
  TelegramMessage,
  TelegramChatJoinRequest,
  TelegramUser,
  TelegramWebhookUpdate,
} from '@ac-bot/platform-contracts/telegram';

const telegramUpdateEventType = 'telegram.update.received';
const joinApplicationCreatedEventType = 'join_application.created';
const memberJoinedEventType = 'member.joined';

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

const telegramChatMemberStatuses = [
  'creator',
  'administrator',
  'member',
  'restricted',
  'left',
  'kicked',
] as const satisfies readonly TelegramChatMemberStatus[];

const isTelegramChatMemberStatus = (input: unknown): input is TelegramChatMemberStatus => {
  return (
    typeof input === 'string' &&
    telegramChatMemberStatuses.some((status) => status === input)
  );
};

const isTelegramUser = (input: unknown): input is TelegramUser => {
  if (!isRecord(input)) {
    return false;
  }

  return hasTelegramId(input.id);
};

const isTelegramMessageWithNewChatMembers = (
  input: unknown,
): input is TelegramMessage & { new_chat_members: TelegramUser[] } => {
  if (!isRecord(input) || !isRecord(input.chat)) {
    return false;
  }

  return (
    Number.isInteger(input.message_id) &&
    Number.isInteger(input.date) &&
    hasTelegramId(input.chat.id) &&
    Array.isArray(input.new_chat_members) &&
    input.new_chat_members.every(isTelegramUser)
  );
};

const isTelegramChatMember = (input: unknown): input is TelegramChatMember => {
  if (!isRecord(input) || !isRecord(input.user)) {
    return false;
  }

  return (
    isTelegramChatMemberStatus(input.status) &&
    isTelegramUser(input.user) &&
    (!Object.hasOwn(input, 'is_member') || typeof input.is_member === 'boolean')
  );
};

const isTelegramChatMemberUpdated = (input: unknown): input is TelegramChatMemberUpdated => {
  if (!isRecord(input) || !isRecord(input.chat) || !isRecord(input.from)) {
    return false;
  }

  return (
    hasTelegramId(input.chat.id) &&
    isTelegramUser(input.from) &&
    Number.isInteger(input.date) &&
    isTelegramChatMember(input.old_chat_member) &&
    isTelegramChatMember(input.new_chat_member)
  );
};

export const isTelegramNewChatMembersUpdate = (
  update: TelegramWebhookUpdate,
): update is TelegramWebhookUpdate & {
  message: TelegramMessage & { new_chat_members: TelegramUser[] };
} => {
  return isTelegramMessageWithNewChatMembers(update.message);
};

export const isTelegramChatMemberUpdatedUpdate = (
  update: TelegramWebhookUpdate,
): update is TelegramWebhookUpdate & { chat_member: TelegramChatMemberUpdated } => {
  return isTelegramChatMemberUpdated(update.chat_member);
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

const toTelegramDateTime = (unixTimestampSeconds: number): string => {
  return new Date(unixTimestampSeconds * 1000).toISOString();
};

const isAbsentMemberStatus = (member: TelegramChatMember) => {
  return member.status === 'left' || member.status === 'kicked' || member.is_member === false;
};

const isJoinedMemberStatus = (member: TelegramChatMember) => {
  if (member.status === 'restricted') {
    return member.is_member === true;
  }

  return member.status === 'creator' || member.status === 'administrator' || member.status === 'member';
};

const createMemberJoinedEvent = (input: {
  updateId: number;
  communityId: number | string;
  platformAccountId: number | string;
  joinedAt: string;
}): CoreEventEnvelope<MemberJoinedPayload> => {
  const platformAccountId = String(input.platformAccountId);
  const eventId = `telegram:${input.updateId}:member.joined:${platformAccountId}`;

  return {
    eventId,
    eventType: memberJoinedEventType,
    occurredAt: input.joinedAt,
    payload: {
      platform: 'telegram',
      platformAccountId,
      communityId: String(input.communityId),
      joinedAt: input.joinedAt,
    },
  };
};

export const createMemberJoinedEventsFromTelegramUpdate = (
  update: TelegramWebhookUpdate,
): CoreEventEnvelope<MemberJoinedPayload>[] => {
  if (isTelegramNewChatMembersUpdate(update)) {
    const joinedAt = toTelegramDateTime(update.message.date);

    return update.message.new_chat_members.map((member) =>
      createMemberJoinedEvent({
        updateId: update.update_id,
        communityId: update.message.chat.id,
        platformAccountId: member.id,
        joinedAt,
      }),
    );
  }

  if (
    isTelegramChatMemberUpdatedUpdate(update) &&
    isAbsentMemberStatus(update.chat_member.old_chat_member) &&
    isJoinedMemberStatus(update.chat_member.new_chat_member)
  ) {
    const joinedAt = toTelegramDateTime(update.chat_member.date);

    return [
      createMemberJoinedEvent({
        updateId: update.update_id,
        communityId: update.chat_member.chat.id,
        platformAccountId: update.chat_member.new_chat_member.user.id,
        joinedAt,
      }),
    ];
  }

  return [];
};
