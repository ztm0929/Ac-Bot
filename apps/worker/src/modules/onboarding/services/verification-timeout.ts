import type { Platform } from '@ac-bot/platform-contracts/core';

export type VerificationTimeoutClock = {
  now(): Date;
};

export type VerificationTimeoutIdGenerator = {
  randomUUID(): string;
};

export type ExpiredVerificationSession = {
  id: string;
  communityId: string;
  platform: Platform;
  platformAccountId: string;
  timeoutAt: string;
};

export type VerificationTimeoutRepository = {
  findExpiredPendingVerificationSessions(input: {
    platform: Platform;
    now: string;
    limit: number;
  }): Promise<ExpiredVerificationSession[]>;
  markVerificationSessionTimedOut(input: {
    sessionId: string;
    completedAt: string;
    failureReason: 'verification_timeout';
  }): Promise<void>;
  updateCommunityMemberStatus(input: {
    communityId: string;
    platformAccountId: string;
    status: 'rejected' | 'banned';
  }): Promise<void>;
  countVerificationTimeouts(input: {
    platform: Platform;
    platformAccountId: string;
  }): Promise<number>;
  createBanIfNone(input: {
    id: string;
    platform: Platform;
    platformAccountId: string;
    reason: 'verification_timeout_limit_exceeded';
    bannedAt: string;
  }): Promise<
    | {
        status: 'created';
        banId: string;
      }
    | {
        status: 'existing';
        banId: string;
      }
  >;
  appendAuditLog(input: {
    id: string;
    action: string;
    targetType: string;
    targetId: string;
    communityId?: string;
    platform: Platform;
    platformAccountId: string;
    metadata?: Record<string, string>;
  }): Promise<void>;
};

export type HandleVerificationTimeoutsOptions = {
  platform: Platform;
  batchSize: number;
  maxVerificationTimeouts: number;
};

export type TimedOutVerificationSessionResult = {
  sessionId: string;
  communityId: string;
  platform: Platform;
  platformAccountId: string;
  timeoutCount: number;
  banId?: string;
};

export type HandleVerificationTimeoutsResult = {
  processedCount: number;
  timedOutSessions: TimedOutVerificationSessionResult[];
};

const defaultClock: VerificationTimeoutClock = {
  now: () => new Date(),
};

const defaultIdGenerator: VerificationTimeoutIdGenerator = {
  randomUUID: () => crypto.randomUUID(),
};

export class VerificationTimeoutService {
  constructor(
    private readonly repository: VerificationTimeoutRepository,
    private readonly clock: VerificationTimeoutClock = defaultClock,
    private readonly idGenerator: VerificationTimeoutIdGenerator = defaultIdGenerator,
  ) {}

  async handleExpiredVerificationSessions(
    options: HandleVerificationTimeoutsOptions,
  ): Promise<HandleVerificationTimeoutsResult> {
    const now = this.clock.now().toISOString();
    const sessions = await this.repository.findExpiredPendingVerificationSessions({
      platform: options.platform,
      now,
      limit: options.batchSize,
    });
    const timedOutSessions: TimedOutVerificationSessionResult[] = [];

    for (const session of sessions) {
      // timeout 扫描可能被 Cron 重试或多实例并发触发；仓储层更新只针对 pending session。
      // 这样即使重复扫到同一条记录，也不会把已通过/已失败的验证重新改成超时。
      await this.repository.markVerificationSessionTimedOut({
        sessionId: session.id,
        completedAt: now,
        failureReason: 'verification_timeout',
      });
      await this.repository.appendAuditLog({
        id: this.idGenerator.randomUUID(),
        action: 'verification.timeout',
        targetType: 'verification_session',
        targetId: session.id,
        communityId: session.communityId,
        platform: session.platform,
        platformAccountId: session.platformAccountId,
        metadata: {
          timeoutAt: session.timeoutAt,
        },
      });

      const timeoutCount = await this.repository.countVerificationTimeouts({
        platform: session.platform,
        platformAccountId: session.platformAccountId,
      });

      if (timeoutCount >= options.maxVerificationTimeouts) {
        const ban = await this.repository.createBanIfNone({
          id: this.idGenerator.randomUUID(),
          platform: session.platform,
          platformAccountId: session.platformAccountId,
          reason: 'verification_timeout_limit_exceeded',
          bannedAt: now,
        });

        await this.repository.updateCommunityMemberStatus({
          communityId: session.communityId,
          platformAccountId: session.platformAccountId,
          status: 'banned',
        });
        await this.repository.appendAuditLog({
          id: this.idGenerator.randomUUID(),
          action: 'member.banned',
          targetType: 'banned_user',
          targetId: ban.banId,
          communityId: session.communityId,
          platform: session.platform,
          platformAccountId: session.platformAccountId,
          metadata: {
            reason: 'verification_timeout_limit_exceeded',
            sessionId: session.id,
          },
        });

        timedOutSessions.push({
          sessionId: session.id,
          communityId: session.communityId,
          platform: session.platform,
          platformAccountId: session.platformAccountId,
          timeoutCount,
          banId: ban.banId,
        });
        continue;
      }

      // 未达到永久拉黑阈值时，本轮 session 仍然失败，成员状态先进入 rejected。
      // 下一层平台 adapter 会负责把用户移出群；如果用户重新加入，将开启新的验证 session。
      await this.repository.updateCommunityMemberStatus({
        communityId: session.communityId,
        platformAccountId: session.platformAccountId,
        status: 'rejected',
      });
      timedOutSessions.push({
        sessionId: session.id,
        communityId: session.communityId,
        platform: session.platform,
        platformAccountId: session.platformAccountId,
        timeoutCount,
      });
    }

    return {
      processedCount: timedOutSessions.length,
      timedOutSessions,
    };
  }
}
