import { describe, expect, it } from 'vitest';

import type { OnboardingRepository } from './member-joined.js';
import { MemberJoinedOnboardingService } from './member-joined.js';

class FakeOnboardingRepository implements OnboardingRepository {
  platformAccounts: Array<{ platform: string; platformAccountId: string }> = [];
  communities: Array<{ platform: string; communityId: string }> = [];
  communityMembers: Array<{ communityId: string; platformAccountId: string; status: string }> = [];
  verificationSessions = new Map<string, { id: string }>();
  auditLogs: Array<{ action: string; targetType: string; targetId: string }> = [];
  activeBan: { id: string } | undefined;

  async upsertPlatformAccount(input: { platform: 'telegram'; platformAccountId: string }) {
    this.platformAccounts.push(input);
  }

  async upsertCommunity(input: { platform: 'telegram'; communityId: string }) {
    this.communities.push(input);
  }

  async upsertCommunityMember(input: {
    communityId: string;
    platformAccountId: string;
    status: 'verification_pending' | 'banned';
    joinedAt: string;
  }) {
    this.communityMembers.push(input);
  }

  async findActiveBan() {
    return this.activeBan;
  }

  async createVerificationSessionIfNone(input: {
    id: string;
    communityId: string;
    platformAccountId: string;
  }) {
    const key = `${input.communityId}:${input.platformAccountId}`;
    const existing = this.verificationSessions.get(key);

    if (existing) {
      return {
        status: 'existing' as const,
        sessionId: existing.id,
      };
    }

    this.verificationSessions.set(key, { id: input.id });

    return {
      status: 'created' as const,
      sessionId: input.id,
    };
  }

  async appendAuditLog(input: {
    action: string;
    targetType: string;
    targetId: string;
  }) {
    this.auditLogs.push(input);
  }
}

const createService = (repository: FakeOnboardingRepository) => {
  const ids = ['audit-1', 'session-1', 'audit-2'];
  let nextIdIndex = 0;

  return new MemberJoinedOnboardingService(
    repository,
    {
      now: () => new Date('2026-07-03T12:00:00.000Z'),
    },
    {
      randomUUID: () => ids[nextIdIndex++] ?? `id-${nextIdIndex}`,
    },
  );
};

const memberJoinedInput = {
  eventId: 'telegram:100:member.joined:456',
  payload: {
    platform: 'telegram' as const,
    platformAccountId: '456',
    communityId: '-100123',
    joinedAt: '2026-07-03T11:59:30.000Z',
  },
};

describe('MemberJoinedOnboardingService', () => {
  it('为新加入成员创建待验证成员记录和验证 session', async () => {
    const repository = new FakeOnboardingRepository();
    const service = createService(repository);

    const result = await service.handleMemberJoined(memberJoinedInput, {
      verificationTimeoutMinutes: 3,
    });

    expect(result).toEqual({
      status: 'verification_session_created',
      sessionId: 'session-1',
      timeoutAt: '2026-07-03T12:03:00.000Z',
    });
    expect(repository.platformAccounts).toEqual([
      {
        platform: 'telegram',
        platformAccountId: '456',
      },
    ]);
    expect(repository.communities).toEqual([
      {
        platform: 'telegram',
        communityId: '-100123',
      },
    ]);
    expect(repository.communityMembers).toEqual([
      {
        communityId: '-100123',
        platformAccountId: '456',
        status: 'verification_pending',
        joinedAt: '2026-07-03T11:59:30.000Z',
      },
    ]);
    expect(repository.auditLogs.map((log) => log.action)).toEqual([
      'member.joined',
      'verification.session_created',
    ]);
  });

  it('已有 pending session 时不重复创建验证 session', async () => {
    const repository = new FakeOnboardingRepository();
    repository.verificationSessions.set('-100123:456', { id: 'session-existing' });
    const service = createService(repository);

    const result = await service.handleMemberJoined(memberJoinedInput, {
      verificationTimeoutMinutes: 3,
    });

    expect(result).toEqual({
      status: 'verification_session_already_pending',
      sessionId: 'session-existing',
      timeoutAt: '2026-07-03T12:03:00.000Z',
    });
    expect(repository.verificationSessions.size).toBe(1);
    expect(repository.auditLogs.map((log) => log.action)).toEqual(['member.joined']);
  });

  it('已拉黑成员重新加入时标记 banned 且不创建验证 session', async () => {
    const repository = new FakeOnboardingRepository();
    repository.activeBan = { id: 'ban-1' };
    const service = createService(repository);

    const result = await service.handleMemberJoined(memberJoinedInput, {
      verificationTimeoutMinutes: 3,
    });

    expect(result).toEqual({
      status: 'banned',
      banId: 'ban-1',
    });
    expect(repository.communityMembers).toEqual([
      {
        communityId: '-100123',
        platformAccountId: '456',
        status: 'banned',
        joinedAt: '2026-07-03T11:59:30.000Z',
      },
    ]);
    expect(repository.verificationSessions.size).toBe(0);
    expect(repository.auditLogs.map((log) => log.action)).toEqual(['member.banned']);
  });
});
