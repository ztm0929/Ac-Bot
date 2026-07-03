import { describe, expect, it } from 'vitest';

import type { Platform } from '@ac-bot/platform-contracts/core';
import type {
  ExpiredVerificationSession,
  VerificationTimeoutRepository,
} from './verification-timeout.js';
import { VerificationTimeoutService } from './verification-timeout.js';

class FakeVerificationTimeoutRepository implements VerificationTimeoutRepository {
  expiredSessions: ExpiredVerificationSession[] = [];
  timeoutCount = 1;
  timedOutSessions: Array<{
    sessionId: string;
    completedAt: string;
    failureReason: 'verification_timeout';
  }> = [];
  memberStatuses: Array<{
    communityId: string;
    platformAccountId: string;
    status: 'rejected' | 'banned';
  }> = [];
  bans: Array<{
    id: string;
    platform: Platform;
    platformAccountId: string;
    reason: 'verification_timeout_limit_exceeded';
    bannedAt: string;
  }> = [];
  auditLogs: Array<{
    id: string;
    action: string;
    targetType: string;
    targetId: string;
    communityId?: string;
    platform: Platform;
    platformAccountId: string;
    metadata?: Record<string, string>;
  }> = [];

  async findExpiredPendingVerificationSessions() {
    return this.expiredSessions;
  }

  async markVerificationSessionTimedOut(input: {
    sessionId: string;
    completedAt: string;
    failureReason: 'verification_timeout';
  }) {
    this.timedOutSessions.push(input);
  }

  async updateCommunityMemberStatus(input: {
    communityId: string;
    platformAccountId: string;
    status: 'rejected' | 'banned';
  }) {
    this.memberStatuses.push(input);
  }

  async countVerificationTimeouts() {
    return this.timeoutCount;
  }

  async createBanIfNone(input: {
    id: string;
    platform: Platform;
    platformAccountId: string;
    reason: 'verification_timeout_limit_exceeded';
    bannedAt: string;
  }) {
    this.bans.push(input);

    return {
      status: 'created' as const,
      banId: input.id,
    };
  }

  async appendAuditLog(input: {
    id: string;
    action: string;
    targetType: string;
    targetId: string;
    communityId?: string;
    platform: Platform;
    platformAccountId: string;
    metadata?: Record<string, string>;
  }) {
    this.auditLogs.push(input);
  }
}

const createService = (repository: FakeVerificationTimeoutRepository) => {
  const ids = ['audit-timeout-1', 'ban-1', 'audit-ban-1'];
  let index = 0;

  return new VerificationTimeoutService(
    repository,
    {
      now: () => new Date('2026-07-03T12:03:01.000Z'),
    },
    {
      randomUUID: () => {
        const id = ids[index];
        index += 1;

        if (!id) {
          throw new Error('测试 ID 不足');
        }

        return id;
      },
    },
  );
};

const expiredSession: ExpiredVerificationSession = {
  id: 'session-1',
  communityId: '-100123',
  platform: 'telegram',
  platformAccountId: '456',
  timeoutAt: '2026-07-03T12:03:00.000Z',
};

const options = {
  platform: 'telegram' as const,
  batchSize: 100,
  maxVerificationTimeouts: 5,
};

describe('VerificationTimeoutService', () => {
  it('将超时 pending session 标记为 timeout 并把成员置为 rejected', async () => {
    const repository = new FakeVerificationTimeoutRepository();
    repository.expiredSessions = [expiredSession];
    repository.timeoutCount = 1;
    const service = createService(repository);

    await expect(service.handleExpiredVerificationSessions(options)).resolves.toEqual({
      processedCount: 1,
      timedOutSessions: [
        {
          sessionId: 'session-1',
          communityId: '-100123',
          platform: 'telegram',
          platformAccountId: '456',
          timeoutCount: 1,
        },
      ],
    });
    expect(repository.timedOutSessions).toEqual([
      {
        sessionId: 'session-1',
        completedAt: '2026-07-03T12:03:01.000Z',
        failureReason: 'verification_timeout',
      },
    ]);
    expect(repository.memberStatuses).toEqual([
      {
        communityId: '-100123',
        platformAccountId: '456',
        status: 'rejected',
      },
    ]);
    expect(repository.auditLogs).toEqual([
      {
        id: 'audit-timeout-1',
        action: 'verification.timeout',
        targetType: 'verification_session',
        targetId: 'session-1',
        communityId: '-100123',
        platform: 'telegram',
        platformAccountId: '456',
        metadata: {
          timeoutAt: '2026-07-03T12:03:00.000Z',
        },
      },
    ]);
  });

  it('累计超时达到上限时创建永久拉黑记录并把成员置为 banned', async () => {
    const repository = new FakeVerificationTimeoutRepository();
    repository.expiredSessions = [expiredSession];
    repository.timeoutCount = 5;
    const service = createService(repository);

    await expect(service.handleExpiredVerificationSessions(options)).resolves.toEqual({
      processedCount: 1,
      timedOutSessions: [
        {
          sessionId: 'session-1',
          communityId: '-100123',
          platform: 'telegram',
          platformAccountId: '456',
          timeoutCount: 5,
          banId: 'ban-1',
        },
      ],
    });
    expect(repository.bans).toEqual([
      {
        id: 'ban-1',
        platform: 'telegram',
        platformAccountId: '456',
        reason: 'verification_timeout_limit_exceeded',
        bannedAt: '2026-07-03T12:03:01.000Z',
      },
    ]);
    expect(repository.memberStatuses).toEqual([
      {
        communityId: '-100123',
        platformAccountId: '456',
        status: 'banned',
      },
    ]);
    expect(repository.auditLogs).toEqual([
      {
        id: 'audit-timeout-1',
        action: 'verification.timeout',
        targetType: 'verification_session',
        targetId: 'session-1',
        communityId: '-100123',
        platform: 'telegram',
        platformAccountId: '456',
        metadata: {
          timeoutAt: '2026-07-03T12:03:00.000Z',
        },
      },
      {
        id: 'audit-ban-1',
        action: 'member.banned',
        targetType: 'banned_user',
        targetId: 'ban-1',
        communityId: '-100123',
        platform: 'telegram',
        platformAccountId: '456',
        metadata: {
          reason: 'verification_timeout_limit_exceeded',
          sessionId: 'session-1',
        },
      },
    ]);
  });

  it('没有超时 session 时保持空操作', async () => {
    const repository = new FakeVerificationTimeoutRepository();
    const service = createService(repository);

    await expect(service.handleExpiredVerificationSessions(options)).resolves.toEqual({
      processedCount: 0,
      timedOutSessions: [],
    });
    expect(repository.auditLogs).toEqual([]);
    expect(repository.memberStatuses).toEqual([]);
  });
});
