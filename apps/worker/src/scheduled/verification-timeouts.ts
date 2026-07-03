import type { BanMemberInput, Platform, RemoveMemberInput } from '@ac-bot/platform-contracts/core';

import { TelegramPlatformApi } from '../adapters/telegram/api.js';
import type { WorkerBindings } from '../app/env.js';
import type {
  HandleVerificationTimeoutsOptions,
  HandleVerificationTimeoutsResult,
  TimedOutVerificationSessionResult,
} from '../modules/onboarding/services/verification-timeout.js';
import { VerificationTimeoutService } from '../modules/onboarding/services/verification-timeout.js';
import { createD1VerificationTimeoutRepository } from '../platform/db/onboarding.js';

const defaultVerificationTimeoutBatchSize = 100;
const defaultVerificationMaxTimeouts = 5;

type TimedOutMemberActionInput = TimedOutVerificationSessionResult & {
  reason: 'verification_timeout' | 'verification_timeout_limit_exceeded';
};

export type VerificationTimeoutSchedulerDependencies = {
  handleExpiredVerificationSessions(
    options: HandleVerificationTimeoutsOptions,
  ): Promise<HandleVerificationTimeoutsResult>;
  removeTimedOutMember(input: TimedOutMemberActionInput): Promise<void>;
  banTimedOutMember(input: TimedOutMemberActionInput): Promise<void>;
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

const toRemoveMemberInput = (input: TimedOutMemberActionInput): RemoveMemberInput => ({
  platform: input.platform,
  communityId: input.communityId,
  platformAccountId: input.platformAccountId,
  reason: input.reason,
});

const toBanMemberInput = (input: TimedOutMemberActionInput): BanMemberInput => ({
  platform: input.platform,
  communityId: input.communityId,
  platformAccountId: input.platformAccountId,
  reason: input.reason,
});

const createDefaultDependencies = (
  env: WorkerBindings,
): VerificationTimeoutSchedulerDependencies => {
  const repository = createD1VerificationTimeoutRepository(env.DB);
  const service = new VerificationTimeoutService(repository);
  const telegramApi = env.TELEGRAM_BOT_TOKEN
    ? new TelegramPlatformApi(env.TELEGRAM_BOT_TOKEN)
    : undefined;

  return {
    async handleExpiredVerificationSessions(options) {
      return service.handleExpiredVerificationSessions(options);
    },
    async removeTimedOutMember(input) {
      if (!telegramApi) {
        throw new Error('TELEGRAM_BOT_TOKEN 未配置，无法移出验证超时成员');
      }

      await telegramApi.removeMember(toRemoveMemberInput(input));
    },
    async banTimedOutMember(input) {
      if (!telegramApi) {
        throw new Error('TELEGRAM_BOT_TOKEN 未配置，无法永久封禁验证超时成员');
      }

      await telegramApi.banMember(toBanMemberInput(input));
    },
  };
};

const readTimeoutSweepOptions = (env: WorkerBindings): HandleVerificationTimeoutsOptions => {
  return {
    platform: 'telegram' satisfies Platform,
    batchSize: readPositiveIntegerEnv(
      env.VERIFICATION_TIMEOUT_BATCH_SIZE,
      defaultVerificationTimeoutBatchSize,
    ),
    maxVerificationTimeouts: readPositiveIntegerEnv(
      env.VERIFICATION_MAX_TIMEOUTS,
      defaultVerificationMaxTimeouts,
    ),
  };
};

export const runVerificationTimeoutSweep = async (
  env: WorkerBindings,
  dependencies: VerificationTimeoutSchedulerDependencies = createDefaultDependencies(env),
) => {
  const result = await dependencies.handleExpiredVerificationSessions(readTimeoutSweepOptions(env));

  for (const session of result.timedOutSessions) {
    if (session.banId) {
      // 达到累计超时阈值的账号已经进入全局拉黑表；平台侧也应保持封禁，不再允许重新加入。
      await dependencies.banTimedOutMember({
        ...session,
        reason: 'verification_timeout_limit_exceeded',
      });
      continue;
    }

    // 普通超时只移出本次入群成员，允许之后再次加入并开启新的验证 session。
    await dependencies.removeTimedOutMember({
      ...session,
      reason: 'verification_timeout',
    });
  }

  return result;
};

export const handleScheduledVerificationTimeouts: ExportedHandlerScheduledHandler<WorkerBindings> =
  async (_controller, env) => {
    await runVerificationTimeoutSweep(env);
  };
