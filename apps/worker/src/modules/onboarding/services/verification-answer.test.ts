import { describe, expect, it } from 'vitest';

import type { Platform } from '@ac-bot/platform-contracts/core';
import type {
  PendingVerificationSession,
  VerificationAnswerRepository,
} from './verification-answer.js';
import { VerificationAnswerService } from './verification-answer.js';

class FakeVerificationAnswerRepository implements VerificationAnswerRepository {
  pendingSession: PendingVerificationSession | undefined;
  passedSessions: Array<{ sessionId: string; completedAt: string }> = [];
  incorrectAnswers: Array<{ sessionId: string; answerAttemptCount: number }> = [];
  failedSessions: Array<{
    sessionId: string;
    completedAt: string;
    answerAttemptCount: number;
    failureReason: 'answer_attempts_exceeded';
  }> = [];
  failureCount = 1;
  bans: Array<{
    id: string;
    platform: Platform;
    platformAccountId: string;
    reason: 'verification_failed_limit_exceeded';
    bannedAt: string;
  }> = [];
  memberStatuses: Array<{
    communityId: string;
    platformAccountId: string;
    status: 'probation' | 'rejected' | 'banned';
    probationUntil?: string;
  }> = [];
  auditLogs: Array<{ action: string; targetId: string }> = [];

  async findLatestPendingVerificationSession() {
    return this.pendingSession;
  }

  async markVerificationSessionPassed(input: { sessionId: string; completedAt: string }) {
    this.passedSessions.push(input);
  }

  async recordIncorrectVerificationAnswer(input: { sessionId: string; answerAttemptCount: number }) {
    this.incorrectAnswers.push(input);
  }

  async markVerificationSessionFailed(input: {
    sessionId: string;
    completedAt: string;
    answerAttemptCount: number;
    failureReason: 'answer_attempts_exceeded';
  }) {
    this.failedSessions.push(input);
  }

  async countVerificationFailures() {
    return this.failureCount;
  }

  async createBanIfNone(input: {
    id: string;
    platform: Platform;
    platformAccountId: string;
    reason: 'verification_failed_limit_exceeded';
    bannedAt: string;
  }) {
    this.bans.push(input);

    return {
      status: 'created' as const,
      banId: input.id,
    };
  }

  async updateCommunityMemberStatus(input: {
    communityId: string;
    platformAccountId: string;
    status: 'probation' | 'rejected' | 'banned';
    probationUntil?: string;
  }) {
    this.memberStatuses.push(input);
  }

  async appendAuditLog(input: { action: string; targetId: string }) {
    this.auditLogs.push(input);
  }
}

const createService = (repository: FakeVerificationAnswerRepository) => {
  const ids = ['audit-1', 'ban-1', 'audit-ban-1'];
  let index = 0;

  return new VerificationAnswerService(
    repository,
    {
      now: () => new Date('2026-07-03T12:00:00.000Z'),
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

const pendingSession: PendingVerificationSession = {
  id: 'session-1',
  communityId: '-100123',
  platformAccountId: '456',
  answerAttemptCount: 0,
  timeoutAt: '2026-07-03T12:03:00.000Z',
};

const createAnswerInput = (answerText: string) => ({
  eventId: 'telegram:200:verification.answer_received:456',
  payload: {
    platform: 'telegram' as const,
    platformAccountId: '456',
    answerText,
    answeredAt: '2026-07-03T12:01:00.000Z',
  },
});

const options = {
  expectedAnswerText: 'configured-answer',
  maxAnswerAttempts: 3,
  maxVerificationFailures: 3,
  probationMinutes: 1440,
};

describe('VerificationAnswerService', () => {
  it('答案正确时标记验证通过并进入观察期', async () => {
    const repository = new FakeVerificationAnswerRepository();
    repository.pendingSession = pendingSession;
    const service = createService(repository);

    const result = await service.handleVerificationAnswer(
      createAnswerInput(' configured-answer '),
      options,
    );

    expect(result).toEqual({
      status: 'passed',
      sessionId: 'session-1',
      communityId: '-100123',
      probationUntil: '2026-07-04T12:00:00.000Z',
    });
    expect(repository.passedSessions).toEqual([
      {
        sessionId: 'session-1',
        completedAt: '2026-07-03T12:00:00.000Z',
      },
    ]);
    expect(repository.memberStatuses).toEqual([
      {
        communityId: '-100123',
        platformAccountId: '456',
        status: 'probation',
        probationUntil: '2026-07-04T12:00:00.000Z',
      },
    ]);
    expect(repository.auditLogs).toEqual([
      {
        id: 'audit-1',
        action: 'verification.completed',
        targetType: 'verification_session',
        targetId: 'session-1',
        communityId: '-100123',
        platform: 'telegram',
        platformAccountId: '456',
        metadata: {
          eventId: 'telegram:200:verification.answer_received:456',
        },
      },
    ]);
  });

  it('答案错误但未超过次数时只记录错误次数', async () => {
    const repository = new FakeVerificationAnswerRepository();
    repository.pendingSession = pendingSession;
    const service = createService(repository);

    const result = await service.handleVerificationAnswer(
      createAnswerInput('wrong-answer'),
      options,
    );

    expect(result).toEqual({
      status: 'incorrect_answer',
      sessionId: 'session-1',
      answerAttemptCount: 1,
    });
    expect(repository.incorrectAnswers).toEqual([
      {
        sessionId: 'session-1',
        answerAttemptCount: 1,
      },
    ]);
    expect(repository.auditLogs).toEqual([]);
  });

  it('答案错误达到上限时标记验证失败', async () => {
    const repository = new FakeVerificationAnswerRepository();
    repository.pendingSession = {
      ...pendingSession,
      answerAttemptCount: 2,
    };
    repository.failureCount = 1;
    const service = createService(repository);

    const result = await service.handleVerificationAnswer(
      createAnswerInput('wrong-answer'),
      options,
    );

    expect(result).toEqual({
      status: 'failed',
      sessionId: 'session-1',
      communityId: '-100123',
      answerAttemptCount: 3,
      failureCount: 1,
    });
    expect(repository.failedSessions).toEqual([
      {
        sessionId: 'session-1',
        completedAt: '2026-07-03T12:00:00.000Z',
        answerAttemptCount: 3,
        failureReason: 'answer_attempts_exceeded',
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
        id: 'audit-1',
        action: 'verification.failed',
        targetType: 'verification_session',
        targetId: 'session-1',
        communityId: '-100123',
        platform: 'telegram',
        platformAccountId: '456',
        metadata: {
          eventId: 'telegram:200:verification.answer_received:456',
          reason: 'answer_attempts_exceeded',
        },
      },
    ]);
  });

  it('累计验证失败达到上限时创建永久拉黑记录', async () => {
    const repository = new FakeVerificationAnswerRepository();
    repository.pendingSession = {
      ...pendingSession,
      answerAttemptCount: 2,
    };
    repository.failureCount = 3;
    const service = createService(repository);

    const result = await service.handleVerificationAnswer(
      createAnswerInput('wrong-answer'),
      options,
    );

    expect(result).toEqual({
      status: 'failed',
      sessionId: 'session-1',
      communityId: '-100123',
      answerAttemptCount: 3,
      failureCount: 3,
      banId: 'ban-1',
    });
    expect(repository.bans).toEqual([
      {
        id: 'ban-1',
        platform: 'telegram',
        platformAccountId: '456',
        reason: 'verification_failed_limit_exceeded',
        bannedAt: '2026-07-03T12:00:00.000Z',
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
        id: 'audit-1',
        action: 'verification.failed',
        targetType: 'verification_session',
        targetId: 'session-1',
        communityId: '-100123',
        platform: 'telegram',
        platformAccountId: '456',
        metadata: {
          eventId: 'telegram:200:verification.answer_received:456',
          reason: 'answer_attempts_exceeded',
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
          reason: 'verification_failed_limit_exceeded',
          sessionId: 'session-1',
        },
      },
    ]);
  });

  it('没有 pending session 时忽略答案', async () => {
    const repository = new FakeVerificationAnswerRepository();
    const service = createService(repository);

    await expect(
      service.handleVerificationAnswer(createAnswerInput('configured-answer'), options),
    ).resolves.toEqual({
      status: 'no_pending_session',
    });
    expect(repository.auditLogs).toEqual([]);
  });
});
