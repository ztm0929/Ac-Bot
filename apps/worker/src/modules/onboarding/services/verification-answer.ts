import type { Platform, VerificationAnswerReceivedPayload } from '@ac-bot/platform-contracts/core';

export type VerificationAnswerClock = {
  now(): Date;
};

export type VerificationAnswerIdGenerator = {
  randomUUID(): string;
};

export type PendingVerificationSession = {
  id: string;
  communityId: string;
  platformAccountId: string;
  answerAttemptCount: number;
  timeoutAt: string;
};

export type VerificationAnswerRepository = {
  findLatestPendingVerificationSession(input: {
    platform: Platform;
    platformAccountId: string;
  }): Promise<PendingVerificationSession | undefined>;
  markVerificationSessionPassed(input: {
    sessionId: string;
    completedAt: string;
  }): Promise<void>;
  recordIncorrectVerificationAnswer(input: {
    sessionId: string;
    answerAttemptCount: number;
  }): Promise<void>;
  markVerificationSessionFailed(input: {
    sessionId: string;
    completedAt: string;
    answerAttemptCount: number;
    failureReason: 'answer_attempts_exceeded';
  }): Promise<void>;
  updateCommunityMemberStatus(input: {
    communityId: string;
    platformAccountId: string;
    status: 'probation' | 'rejected';
    probationUntil?: string;
  }): Promise<void>;
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

export type HandleVerificationAnswerInput = {
  eventId: string;
  payload: VerificationAnswerReceivedPayload;
};

export type HandleVerificationAnswerOptions = {
  expectedAnswerText: string;
  maxAnswerAttempts: number;
  probationMinutes: number;
};

export type HandleVerificationAnswerResult =
  | {
      status: 'passed';
      sessionId: string;
      communityId: string;
      probationUntil: string;
    }
  | {
      status: 'incorrect_answer';
      sessionId: string;
      answerAttemptCount: number;
    }
  | {
      status: 'failed';
      sessionId: string;
      communityId: string;
      answerAttemptCount: number;
    }
  | {
      status: 'no_pending_session';
    };

const defaultClock: VerificationAnswerClock = {
  now: () => new Date(),
};

const defaultIdGenerator: VerificationAnswerIdGenerator = {
  randomUUID: () => crypto.randomUUID(),
};

const normalizeAnswer = (input: string) => input.trim().toLowerCase();

const addMinutes = (date: Date, minutes: number) => {
  return new Date(date.getTime() + minutes * 60_000);
};

export class VerificationAnswerService {
  constructor(
    private readonly repository: VerificationAnswerRepository,
    private readonly clock: VerificationAnswerClock = defaultClock,
    private readonly idGenerator: VerificationAnswerIdGenerator = defaultIdGenerator,
  ) {}

  async handleVerificationAnswer(
    input: HandleVerificationAnswerInput,
    options: HandleVerificationAnswerOptions,
  ): Promise<HandleVerificationAnswerResult> {
    const session = await this.repository.findLatestPendingVerificationSession({
      platform: input.payload.platform,
      platformAccountId: input.payload.platformAccountId,
    });

    if (!session) {
      // 用户可能在完成验证后继续给 bot 发消息，或 Telegram 重试了过期事件。
      // core 层只关心 pending session；非验证上下文的私聊文本不应触发封禁或审计噪音。
      return { status: 'no_pending_session' };
    }

    const now = this.clock.now();
    const completedAt = now.toISOString();
    const isCorrectAnswer =
      normalizeAnswer(input.payload.answerText) === normalizeAnswer(options.expectedAnswerText);

    if (isCorrectAnswer) {
      const probationUntil = addMinutes(now, options.probationMinutes).toISOString();

      // 通过验证只进入“观察期”，不直接恢复全部权限。
      // 具体平台能开放哪些动作由 adapter 映射，这里只表达平台无关的成员状态。
      await this.repository.markVerificationSessionPassed({
        sessionId: session.id,
        completedAt,
      });
      await this.repository.updateCommunityMemberStatus({
        communityId: session.communityId,
        platformAccountId: session.platformAccountId,
        status: 'probation',
        probationUntil,
      });
      await this.repository.appendAuditLog({
        id: this.idGenerator.randomUUID(),
        action: 'verification.completed',
        targetType: 'verification_session',
        targetId: session.id,
        communityId: session.communityId,
        platform: input.payload.platform,
        platformAccountId: session.platformAccountId,
        metadata: {
          eventId: input.eventId,
        },
      });

      return {
        status: 'passed',
        sessionId: session.id,
        communityId: session.communityId,
        probationUntil,
      };
    }

    const nextAttemptCount = session.answerAttemptCount + 1;

    if (nextAttemptCount >= options.maxAnswerAttempts) {
      // 达到错误次数上限后立即关闭 session，后续移出群和拉黑策略由调用方继续编排。
      // 这里记录失败原因和审计事件，但仍然不记录用户提交过的具体答案文本。
      await this.repository.markVerificationSessionFailed({
        sessionId: session.id,
        completedAt,
        answerAttemptCount: nextAttemptCount,
        failureReason: 'answer_attempts_exceeded',
      });
      await this.repository.updateCommunityMemberStatus({
        communityId: session.communityId,
        platformAccountId: session.platformAccountId,
        status: 'rejected',
      });
      await this.repository.appendAuditLog({
        id: this.idGenerator.randomUUID(),
        action: 'verification.failed',
        targetType: 'verification_session',
        targetId: session.id,
        communityId: session.communityId,
        platform: input.payload.platform,
        platformAccountId: session.platformAccountId,
        metadata: {
          eventId: input.eventId,
          reason: 'answer_attempts_exceeded',
        },
      });

      return {
        status: 'failed',
        sessionId: session.id,
        communityId: session.communityId,
        answerAttemptCount: nextAttemptCount,
      };
    }

    // 错误答案只增加次数，不写入答案文本；验证答案属于私有运营配置，不应进入日志或审计。
    await this.repository.recordIncorrectVerificationAnswer({
      sessionId: session.id,
      answerAttemptCount: nextAttemptCount,
    });

    return {
      status: 'incorrect_answer',
      sessionId: session.id,
      answerAttemptCount: nextAttemptCount,
    };
  }
}
