import type { CoreEventEnvelope, MemberJoinedPayload, PlatformEventEnvelope } from '@ac-bot/platform-contracts/core';
import { isPlatformEventEnvelope } from '@ac-bot/platform-contracts/core';

import { TelegramPlatformApi } from '../adapters/telegram/api.js';
import {
  createMemberJoinedEventsFromTelegramUpdate,
  createJoinApplicationCreatedEventFromTelegramUpdate,
  isTelegramWebhookUpdate,
} from '../adapters/telegram/mapper.js';
import type { WorkerBindings } from '../app/env.js';
import { MemberJoinedOnboardingService } from '../modules/onboarding/services/member-joined.js';
import { persistJoinApplicationCreatedEvent } from '../platform/db/join-applications.js';
import { createD1OnboardingRepository } from '../platform/db/onboarding.js';
import { persistPlatformEvent } from '../platform/db/platform-events.js';

const defaultVerificationTimeoutMinutes = 3;

export type PlatformEventProcessorDependencies = {
  persistPlatformEvent: typeof persistPlatformEvent;
  persistJoinApplicationCreatedEvent: typeof persistJoinApplicationCreatedEvent;
  handleMemberJoined(input: CoreEventEnvelope<MemberJoinedPayload>): Promise<void>;
};

const readVerificationTimeoutMinutes = (env: WorkerBindings) => {
  const configuredValue = env.VERIFICATION_TIMEOUT_MINUTES;

  if (!configuredValue) {
    return defaultVerificationTimeoutMinutes;
  }

  const parsedValue = Number(configuredValue);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return defaultVerificationTimeoutMinutes;
  }

  return parsedValue;
};

const createDefaultDependencies = (env: WorkerBindings): PlatformEventProcessorDependencies => {
  const onboardingRepository = createD1OnboardingRepository(env.DB);
  const onboardingService = new MemberJoinedOnboardingService(onboardingRepository);
  const telegramApi = env.TELEGRAM_BOT_TOKEN
    ? new TelegramPlatformApi(env.TELEGRAM_BOT_TOKEN)
    : undefined;

  return {
    persistPlatformEvent,
    persistJoinApplicationCreatedEvent,
    async handleMemberJoined(coreEvent) {
      const result = await onboardingService.handleMemberJoined(coreEvent, {
        verificationTimeoutMinutes: readVerificationTimeoutMinutes(env),
      });

      if (!telegramApi) {
        throw new Error('TELEGRAM_BOT_TOKEN 未配置，无法限制新成员发言');
      }

      if (result.status === 'banned') {
        await telegramApi.banMember({
          platform: coreEvent.payload.platform,
          communityId: coreEvent.payload.communityId,
          platformAccountId: coreEvent.payload.platformAccountId,
          reason: 'active_ban',
        });
        return;
      }

      await telegramApi.restrictMember({
        platform: coreEvent.payload.platform,
        communityId: coreEvent.payload.communityId,
        platformAccountId: coreEvent.payload.platformAccountId,
        mode: 'verification_locked',
      });
    },
  };
};

export const processPlatformEventEnvelope = async (
  env: WorkerBindings,
  envelope: PlatformEventEnvelope,
  dependencies: PlatformEventProcessorDependencies = createDefaultDependencies(env),
) => {
  await dependencies.persistPlatformEvent(env.DB, envelope);

  if (
    envelope.platform !== 'telegram' ||
    envelope.eventType !== 'telegram.update.received' ||
    !isTelegramWebhookUpdate(envelope.payload)
  ) {
    return;
  }

  // 对 Telegram 新成员治理而言，重复执行“限制成员”比漏限制更可接受。
  // 因此即使 platform_events 已经命中唯一索引，也继续走后续幂等流程，避免外部 API 失败后重试被去重挡住。
  const joinApplicationCreatedEvent = createJoinApplicationCreatedEventFromTelegramUpdate(
    envelope.payload,
    envelope.receivedAt,
  );

  if (joinApplicationCreatedEvent) {
    await dependencies.persistJoinApplicationCreatedEvent(env.DB, joinApplicationCreatedEvent);
  }

  const memberJoinedEvents = createMemberJoinedEventsFromTelegramUpdate(envelope.payload);

  // 一个 Telegram message 可能包含多个 new_chat_members；必须逐个处理，避免只限制第一个新人。
  for (const memberJoinedEvent of memberJoinedEvents) {
    await dependencies.handleMemberJoined(memberJoinedEvent);
  }
};

export const consumePlatformEvents: ExportedHandlerQueueHandler<WorkerBindings, unknown> = async (batch, env) => {
  const dependencies = createDefaultDependencies(env);

  for (const message of batch.messages) {
    if (!isPlatformEventEnvelope(message.body)) {
      message.ack();
      continue;
    }

    await processPlatformEventEnvelope(env, message.body, dependencies);

    message.ack();
  }
};
