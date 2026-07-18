import type {
  CoreEventEnvelope,
  MemberJoinedPayload,
  MessageTextFormat,
  PlatformEventEnvelope,
  VerificationAnswerReceivedPayload,
} from '@ac-bot/platform-contracts/core';
import { isPlatformEventEnvelope } from '@ac-bot/platform-contracts/core';

import { TelegramPlatformApi } from '../adapters/telegram/api.js';
import {
  createMemberJoinedEventsFromTelegramUpdate,
  createJoinApplicationCreatedEventFromTelegramUpdate,
  createVerificationAnswerReceivedEventFromTelegramUpdate,
  isTelegramWebhookUpdate,
} from '../adapters/telegram/mapper.js';
import type { WorkerBindings } from '../app/env.js';
import { VerificationRiskRouter } from '../modules/moderation/services/risk-routing.js';
import { MemberJoinedOnboardingService } from '../modules/onboarding/services/member-joined.js';
import { VerificationAnswerService } from '../modules/onboarding/services/verification-answer.js';
import { persistJoinApplicationCreatedEvent } from '../platform/db/join-applications.js';
import {
  createD1OnboardingRepository,
  createD1VerificationAnswerRepository,
} from '../platform/db/onboarding.js';
import { persistPlatformEvent } from '../platform/db/platform-events.js';

const defaultVerificationTimeoutMinutes = 3;
const defaultVerificationMaxAnswerAttempts = 3;
const defaultVerificationMaxFailures = 3;
const defaultProbationMinutes = 1440;
const defaultVerificationPromptText = '欢迎加入社群，请在机器人私聊窗口完成新人验证。';
const defaultVerificationPromptGroupFallbackText =
  '欢迎新同学，请点击机器人私聊窗口完成新人验证。';
const messageTextFormats = new Set<MessageTextFormat>([
  'plain_text',
  'markdown',
  'html',
  'latex_inline',
  'latex_block',
]);

export type PlatformEventProcessorDependencies = {
  persistPlatformEvent: typeof persistPlatformEvent;
  persistJoinApplicationCreatedEvent: typeof persistJoinApplicationCreatedEvent;
  handleMemberJoined(input: CoreEventEnvelope<MemberJoinedPayload>): Promise<void>;
  handleVerificationAnswer(input: CoreEventEnvelope<VerificationAnswerReceivedPayload>): Promise<void>;
};

const readPositiveIntegerEnv = (configuredValue: string | undefined, fallback: number) => {
  if (!configuredValue) {
    return fallback;
  }

  const parsedValue = Number(configuredValue);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
};

export const readMessageTextFormatEnv = (
  configuredValue: string | undefined,
): MessageTextFormat | undefined => {
  if (!configuredValue) {
    return undefined;
  }

  if (messageTextFormats.has(configuredValue as MessageTextFormat)) {
    return configuredValue as MessageTextFormat;
  }

  throw new Error(`消息格式配置无效: ${configuredValue}`);
};

const createDefaultDependencies = (env: WorkerBindings): PlatformEventProcessorDependencies => {
  const onboardingRepository = createD1OnboardingRepository(env.DB);
  const onboardingService = new MemberJoinedOnboardingService(onboardingRepository);
  const verificationAnswerRepository = createD1VerificationAnswerRepository(env.DB);
  const verificationAnswerService = new VerificationAnswerService(verificationAnswerRepository);
  const verificationRiskRouter = new VerificationRiskRouter();
  const telegramApi = env.TELEGRAM_BOT_TOKEN
    ? new TelegramPlatformApi(env.TELEGRAM_BOT_TOKEN)
    : undefined;

  return {
    persistPlatformEvent,
    persistJoinApplicationCreatedEvent,
    async handleMemberJoined(coreEvent) {
      const result = await onboardingService.handleMemberJoined(coreEvent, {
        verificationTimeoutMinutes: readPositiveIntegerEnv(
          env.VERIFICATION_TIMEOUT_MINUTES,
          defaultVerificationTimeoutMinutes,
        ),
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
      // 先限制发言再发送引导，确保即使提示发送失败并触发队列重试，新人也不会获得刷屏窗口。
      // 验证题面属于运营配置；这里的默认文案只提供入口，不写入真实题目或答案。
      const directMessageFormat = readMessageTextFormatEnv(env.VERIFICATION_PROMPT_FORMAT);
      const groupFallbackFormat = readMessageTextFormatEnv(
        env.VERIFICATION_PROMPT_GROUP_FALLBACK_FORMAT,
      );
      await telegramApi.sendVerificationPrompt({
        platform: coreEvent.payload.platform,
        communityId: coreEvent.payload.communityId,
        platformAccountId: coreEvent.payload.platformAccountId,
        directMessageText: env.VERIFICATION_PROMPT_TEXT ?? defaultVerificationPromptText,
        ...(directMessageFormat ? { directMessageFormat } : {}),
        groupFallbackText:
          env.VERIFICATION_PROMPT_GROUP_FALLBACK_TEXT ?? defaultVerificationPromptGroupFallbackText,
        ...(groupFallbackFormat ? { groupFallbackFormat } : {}),
      });
    },
    async handleVerificationAnswer(coreEvent) {
      if (!env.VERIFICATION_ANSWER_TEXT) {
        throw new Error('VERIFICATION_ANSWER_TEXT 未配置，无法校验验证答案');
      }

      const result = await verificationAnswerService.handleVerificationAnswer(coreEvent, {
        expectedAnswerText: env.VERIFICATION_ANSWER_TEXT,
        maxAnswerAttempts: readPositiveIntegerEnv(
          env.VERIFICATION_MAX_ANSWER_ATTEMPTS,
          defaultVerificationMaxAnswerAttempts,
        ),
        maxVerificationFailures: readPositiveIntegerEnv(
          env.VERIFICATION_MAX_FAILURES,
          defaultVerificationMaxFailures,
        ),
        probationMinutes: readPositiveIntegerEnv(env.PROBATION_MINUTES, defaultProbationMinutes),
        riskDecision: verificationRiskRouter.decide({
          configuredRiskLevel: env.VERIFICATION_RISK_LEVEL,
        }),
      });

      if (result.status === 'passed') {
        if (!telegramApi) {
          throw new Error('TELEGRAM_BOT_TOKEN 未配置，无法恢复验证通过成员权限');
        }

        await telegramApi.restoreMember({
          platform: coreEvent.payload.platform,
          communityId: result.communityId,
          platformAccountId: coreEvent.payload.platformAccountId,
          mode: 'probation_text_only',
          reason: 'verification_passed',
        });
        return;
      }

      if (result.status === 'manual_review') {
        return;
      }

      if (result.status === 'high_risk_banned') {
        if (!telegramApi) {
          throw new Error('TELEGRAM_BOT_TOKEN 未配置，无法封禁高风险成员');
        }

        await telegramApi.banMember({
          platform: coreEvent.payload.platform,
          communityId: result.communityId,
          platformAccountId: coreEvent.payload.platformAccountId,
          reason: 'high_risk_after_verification',
        });
        return;
      }

      if (result.status === 'failed') {
        if (!telegramApi) {
          throw new Error('TELEGRAM_BOT_TOKEN 未配置，无法处理验证失败成员');
        }

        if (result.banId) {
          await telegramApi.banMember({
            platform: coreEvent.payload.platform,
            communityId: result.communityId,
            platformAccountId: coreEvent.payload.platformAccountId,
            reason: 'verification_failed_limit_exceeded',
          });
          return;
        }

        await telegramApi.removeMember({
          platform: coreEvent.payload.platform,
          communityId: result.communityId,
          platformAccountId: coreEvent.payload.platformAccountId,
          reason: 'verification_failed',
        });
      }
    },
  };
};

export const processPlatformEventEnvelope = async (
  env: WorkerBindings,
  envelope: PlatformEventEnvelope,
  dependencies: PlatformEventProcessorDependencies = createDefaultDependencies(env),
) => {
  const persistedPlatformEvent = await dependencies.persistPlatformEvent(env.DB, envelope);

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

  const verificationAnswerReceivedEvent = createVerificationAnswerReceivedEventFromTelegramUpdate(
    envelope.payload,
  );

  // 答案事件会改变答题次数，不能像禁言动作一样在 Telegram 重试时重复执行。
  // 这里依赖 platform_events 的 rawEventId 去重，避免同一条私聊消息被重复计为多次错误。
  if (verificationAnswerReceivedEvent && persistedPlatformEvent.status === 'created') {
    await dependencies.handleVerificationAnswer(verificationAnswerReceivedEvent);
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
