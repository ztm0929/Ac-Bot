import type { MemberJoinedPayload, Platform } from '@ac-bot/platform-contracts/core';

export type OnboardingClock = {
  now(): Date;
};

export type OnboardingIdGenerator = {
  randomUUID(): string;
};

export type OnboardingRepository = {
  upsertPlatformAccount(input: {
    platform: Platform;
    platformAccountId: string;
  }): Promise<void>;
  upsertCommunity(input: {
    platform: Platform;
    communityId: string;
  }): Promise<void>;
  upsertCommunityMember(input: {
    communityId: string;
    platformAccountId: string;
    status: 'verification_pending' | 'banned';
    joinedAt: string;
  }): Promise<void>;
  findActiveBan(input: {
    platform: Platform;
    platformAccountId: string;
    communityId: string;
  }): Promise<{ id: string } | undefined>;
  createVerificationSessionIfNone(input: {
    id: string;
    communityId: string;
    platformAccountId: string;
    channel: 'direct_message';
    timeoutAt: string;
  }): Promise<
    | {
        status: 'created';
        sessionId: string;
      }
    | {
        status: 'existing';
        sessionId: string;
      }
  >;
  appendAuditLog(input: {
    id: string;
    action: string;
    targetType: string;
    targetId: string;
    communityId: string;
    platform: Platform;
    platformAccountId: string;
    metadata?: Record<string, string>;
  }): Promise<void>;
};

export type HandleMemberJoinedInput = {
  eventId: string;
  payload: MemberJoinedPayload;
};

export type HandleMemberJoinedOptions = {
  verificationTimeoutMinutes: number;
};

export type HandleMemberJoinedResult =
  | {
      status: 'banned';
      banId: string;
    }
  | {
      status: 'verification_session_created';
      sessionId: string;
      timeoutAt: string;
    }
  | {
      status: 'verification_session_already_pending';
      sessionId: string;
      timeoutAt: string;
    };

const defaultClock: OnboardingClock = {
  now: () => new Date(),
};

const defaultIdGenerator: OnboardingIdGenerator = {
  randomUUID: () => crypto.randomUUID(),
};

const toIsoString = (date: Date) => date.toISOString();

const addMinutes = (date: Date, minutes: number) => {
  return new Date(date.getTime() + minutes * 60_000);
};

export class MemberJoinedOnboardingService {
  constructor(
    private readonly repository: OnboardingRepository,
    private readonly clock: OnboardingClock = defaultClock,
    private readonly idGenerator: OnboardingIdGenerator = defaultIdGenerator,
  ) {}

  async handleMemberJoined(
    input: HandleMemberJoinedInput,
    options: HandleMemberJoinedOptions,
  ): Promise<HandleMemberJoinedResult> {
    const { payload } = input;

    await this.repository.upsertPlatformAccount({
      platform: payload.platform,
      platformAccountId: payload.platformAccountId,
    });
    await this.repository.upsertCommunity({
      platform: payload.platform,
      communityId: payload.communityId,
    });

    const activeBan = await this.repository.findActiveBan({
      platform: payload.platform,
      platformAccountId: payload.platformAccountId,
      communityId: payload.communityId,
    });

    if (activeBan) {
      await this.repository.upsertCommunityMember({
        communityId: payload.communityId,
        platformAccountId: payload.platformAccountId,
        status: 'banned',
        joinedAt: payload.joinedAt,
      });
      await this.repository.appendAuditLog({
        id: this.idGenerator.randomUUID(),
        action: 'member.banned',
        targetType: 'community_member',
        targetId: `${payload.communityId}:${payload.platformAccountId}`,
        communityId: payload.communityId,
        platform: payload.platform,
        platformAccountId: payload.platformAccountId,
        metadata: {
          eventId: input.eventId,
          banId: activeBan.id,
        },
      });

      return {
        status: 'banned',
        banId: activeBan.id,
      };
    }

    await this.repository.upsertCommunityMember({
      communityId: payload.communityId,
      platformAccountId: payload.platformAccountId,
      status: 'verification_pending',
      joinedAt: payload.joinedAt,
    });
    await this.repository.appendAuditLog({
      id: this.idGenerator.randomUUID(),
      action: 'member.joined',
      targetType: 'community_member',
      targetId: `${payload.communityId}:${payload.platformAccountId}`,
      communityId: payload.communityId,
      platform: payload.platform,
      platformAccountId: payload.platformAccountId,
      metadata: {
        eventId: input.eventId,
      },
    });

    const timeoutAt = toIsoString(addMinutes(this.clock.now(), options.verificationTimeoutMinutes));
    const verificationSession = await this.repository.createVerificationSessionIfNone({
      id: this.idGenerator.randomUUID(),
      communityId: payload.communityId,
      platformAccountId: payload.platformAccountId,
      channel: 'direct_message',
      timeoutAt,
    });

    if (verificationSession.status === 'created') {
      await this.repository.appendAuditLog({
        id: this.idGenerator.randomUUID(),
        action: 'verification.session_created',
        targetType: 'verification_session',
        targetId: verificationSession.sessionId,
        communityId: payload.communityId,
        platform: payload.platform,
        platformAccountId: payload.platformAccountId,
        metadata: {
          eventId: input.eventId,
        },
      });

      return {
        status: 'verification_session_created',
        sessionId: verificationSession.sessionId,
        timeoutAt,
      };
    }

    return {
      status: 'verification_session_already_pending',
      sessionId: verificationSession.sessionId,
      timeoutAt,
    };
  }
}
