import {
  auditLogs,
  bannedUsers,
  communities,
  communityMembers,
  platformAccounts,
  verificationSessions,
} from '@ac-bot/db/schema';
import type { Platform } from '@ac-bot/platform-contracts/core';
import { and, count, desc, eq, isNull, lte, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

import type { OnboardingRepository } from '../../modules/onboarding/services/member-joined.js';
import type { VerificationAnswerRepository } from '../../modules/onboarding/services/verification-answer.js';
import type { VerificationTimeoutRepository } from '../../modules/onboarding/services/verification-timeout.js';

const isUniqueConstraintError = (error: unknown) => {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
};

const toPlatformAccountRowId = (platform: Platform, platformAccountId: string) => {
  return `${platform}:${platformAccountId}`;
};

const toCommunityRowId = (platform: Platform, communityId: string) => {
  return `${platform}:${communityId}`;
};

const nowIsoString = () => new Date().toISOString();

const findActiveGlobalBan = (db: ReturnType<typeof drizzle>, input: {
  platform: Platform;
  platformAccountId: string;
}) => {
  return db
    .select({
      id: bannedUsers.id,
    })
    .from(bannedUsers)
    .where(
      and(
        eq(bannedUsers.platform, input.platform),
        eq(bannedUsers.platformAccountId, input.platformAccountId),
        isNull(bannedUsers.communityId),
        isNull(bannedUsers.liftedAt),
      ),
    )
    .get();
};

export const createD1OnboardingRepository = (dbBinding: D1Database): OnboardingRepository => {
  const db = drizzle(dbBinding);

  const findPendingVerificationSession = async (input: {
    communityId: string;
    platformAccountId: string;
  }) => {
    return db
      .select({
        id: verificationSessions.id,
      })
      .from(verificationSessions)
      .where(
        and(
          eq(verificationSessions.communityId, input.communityId),
          eq(verificationSessions.platformAccountId, input.platformAccountId),
          eq(verificationSessions.status, 'pending'),
        ),
      )
      .get();
  };

  return {
    async upsertPlatformAccount(input) {
      const id = toPlatformAccountRowId(input.platform, input.platformAccountId);
      const updatedAt = nowIsoString();

      await db
        .insert(platformAccounts)
        .values({
          id,
          platform: input.platform,
          platformUserId: input.platformAccountId,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: [platformAccounts.platform, platformAccounts.platformUserId],
          set: {
            updatedAt,
          },
        });
    },

    async upsertCommunity(input) {
      const id = toCommunityRowId(input.platform, input.communityId);
      const updatedAt = nowIsoString();

      await db
        .insert(communities)
        .values({
          id,
          platform: input.platform,
          platformResourceId: input.communityId,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: [communities.platform, communities.platformResourceId],
          set: {
            updatedAt,
          },
        });
    },

    async upsertCommunityMember(input) {
      const id = `${input.communityId}:${input.platformAccountId}`;
      const updatedAt = nowIsoString();

      await db
        .insert(communityMembers)
        .values({
          id,
          communityId: input.communityId,
          platformAccountId: input.platformAccountId,
          status: input.status,
          joinedAt: input.joinedAt,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: [communityMembers.communityId, communityMembers.platformAccountId],
          set: {
            status: input.status,
            joinedAt: input.joinedAt,
            leftAt: null,
            updatedAt,
          },
        });
    },

    async findActiveBan(input) {
      return db
        .select({
          id: bannedUsers.id,
        })
        .from(bannedUsers)
        .where(
          and(
            eq(bannedUsers.platform, input.platform),
            eq(bannedUsers.platformAccountId, input.platformAccountId),
            isNull(bannedUsers.liftedAt),
            or(eq(bannedUsers.communityId, input.communityId), isNull(bannedUsers.communityId)),
          ),
        )
        .get();
    },

    async createVerificationSessionIfNone(input) {
      const existing = await findPendingVerificationSession(input);

      if (existing) {
        return {
          status: 'existing',
          sessionId: existing.id,
        };
      }

      try {
        await db.insert(verificationSessions).values({
          id: input.id,
          communityId: input.communityId,
          platformAccountId: input.platformAccountId,
          channel: input.channel,
          timeoutAt: input.timeoutAt,
        });

        return {
          status: 'created',
          sessionId: input.id,
        };
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }

        const racedExisting = await findPendingVerificationSession(input);

        if (!racedExisting) {
          throw error;
        }

        return {
          status: 'existing',
          sessionId: racedExisting.id,
        };
      }
    },

    async appendAuditLog(input) {
      const values: typeof auditLogs.$inferInsert = {
        id: input.id,
        actorType: 'system',
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        communityId: input.communityId,
        platform: input.platform,
        platformAccountId: input.platformAccountId,
      };

      if (input.metadata) {
        values.metadataJson = JSON.stringify(input.metadata);
      }

      await db.insert(auditLogs).values(values);
    },
  };
};

export const createD1VerificationAnswerRepository = (
  dbBinding: D1Database,
): VerificationAnswerRepository => {
  const db = drizzle(dbBinding);

  return {
    async findLatestPendingVerificationSession(input) {
      // 一个账号可能反复离开再加入，因此历史上可能存在多个已结束 session。
      // 这里只取最新 pending session，保证用户当前这轮私聊答案落到最近一次入群验证上。
      return db
        .select({
          id: verificationSessions.id,
          communityId: verificationSessions.communityId,
          platformAccountId: verificationSessions.platformAccountId,
          answerAttemptCount: verificationSessions.answerAttemptCount,
          timeoutAt: verificationSessions.timeoutAt,
        })
        .from(verificationSessions)
        .where(
          and(
            eq(verificationSessions.platformAccountId, input.platformAccountId),
            eq(verificationSessions.status, 'pending'),
          ),
        )
        .orderBy(desc(verificationSessions.createdAt))
        .get();
    },

    async markVerificationSessionPassed(input) {
      await db
        .update(verificationSessions)
        .set({
          status: 'passed',
          completedAt: input.completedAt,
          updatedAt: nowIsoString(),
        })
        .where(eq(verificationSessions.id, input.sessionId));
    },

    async recordIncorrectVerificationAnswer(input) {
      await db
        .update(verificationSessions)
        .set({
          answerAttemptCount: input.answerAttemptCount,
          updatedAt: nowIsoString(),
        })
        .where(eq(verificationSessions.id, input.sessionId));
    },

    async markVerificationSessionFailed(input) {
      await db
        .update(verificationSessions)
        .set({
          status: 'failed',
          answerAttemptCount: input.answerAttemptCount,
          completedAt: input.completedAt,
          failureReason: input.failureReason,
          updatedAt: nowIsoString(),
        })
        .where(eq(verificationSessions.id, input.sessionId));
    },

    async countVerificationFailures(input) {
      const result = await db
        .select({
          value: count(),
        })
        .from(verificationSessions)
        .innerJoin(communities, eq(communities.platformResourceId, verificationSessions.communityId))
        .where(
          and(
            eq(communities.platform, input.platform),
            eq(verificationSessions.platformAccountId, input.platformAccountId),
            eq(verificationSessions.status, 'failed'),
          ),
        )
        .get();

      return result?.value ?? 0;
    },

    async createBanIfNone(input) {
      const existing = await findActiveGlobalBan(db, input);

      if (existing) {
        return {
          status: 'existing',
          banId: existing.id,
        };
      }

      try {
        await db.insert(bannedUsers).values({
          id: input.id,
          platform: input.platform,
          platformAccountId: input.platformAccountId,
          reason: input.reason,
          bannedAt: input.bannedAt,
        });

        return {
          status: 'created',
          banId: input.id,
        };
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }

        const racedExisting = await findActiveGlobalBan(db, input);

        if (!racedExisting) {
          throw error;
        }

        return {
          status: 'existing',
          banId: racedExisting.id,
        };
      }
    },

    async updateCommunityMemberStatus(input) {
      // 答案服务可能先于某些成员资料补全流程运行；这里用 upsert 保证状态流转不依赖调用顺序。
      // probationUntil 仅对观察期有意义，拒绝时显式清空，避免旧观察期残留影响后台判断。
      const values: typeof communityMembers.$inferInsert = {
        id: `${input.communityId}:${input.platformAccountId}`,
        communityId: input.communityId,
        platformAccountId: input.platformAccountId,
        status: input.status,
        updatedAt: nowIsoString(),
      };

      if (input.probationUntil) {
        values.probationUntil = input.probationUntil;
      }

      await db
        .insert(communityMembers)
        .values(values)
        .onConflictDoUpdate({
          target: [communityMembers.communityId, communityMembers.platformAccountId],
          set: {
            status: input.status,
            probationUntil: input.probationUntil ?? null,
            updatedAt: nowIsoString(),
          },
        });
    },

    async appendAuditLog(input) {
      const values: typeof auditLogs.$inferInsert = {
        id: input.id,
        actorType: 'system',
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        communityId: input.communityId,
        platform: input.platform,
        platformAccountId: input.platformAccountId,
      };

      if (input.metadata) {
        values.metadataJson = JSON.stringify(input.metadata);
      }

      await db.insert(auditLogs).values(values);
    },
  };
};

export const createD1VerificationTimeoutRepository = (
  dbBinding: D1Database,
): VerificationTimeoutRepository => {
  const db = drizzle(dbBinding);

  return {
    async findExpiredPendingVerificationSessions(input) {
      // verification_sessions 只保存平台无关的 communityId；这里通过 communities 表恢复 platform。
      // 这样 timeout 扫描仍能按平台分批执行，后续接 QQ/Discord 时不会误扫其他平台。
      return db
        .select({
          id: verificationSessions.id,
          communityId: verificationSessions.communityId,
          platform: communities.platform,
          platformAccountId: verificationSessions.platformAccountId,
          timeoutAt: verificationSessions.timeoutAt,
        })
        .from(verificationSessions)
        .innerJoin(communities, eq(communities.platformResourceId, verificationSessions.communityId))
        .where(
          and(
            eq(communities.platform, input.platform),
            eq(verificationSessions.status, 'pending'),
            lte(verificationSessions.timeoutAt, input.now),
          ),
        )
        .orderBy(verificationSessions.timeoutAt)
        .limit(input.limit);
    },

    async markVerificationSessionTimedOut(input) {
      await db
        .update(verificationSessions)
        .set({
          status: 'timeout',
          completedAt: input.completedAt,
          failureReason: input.failureReason,
          updatedAt: nowIsoString(),
        })
        .where(
          and(
            eq(verificationSessions.id, input.sessionId),
            eq(verificationSessions.status, 'pending'),
          ),
        );
    },

    async updateCommunityMemberStatus(input) {
      await db
        .update(communityMembers)
        .set({
          status: input.status,
          probationUntil: null,
          updatedAt: nowIsoString(),
        })
        .where(
          and(
            eq(communityMembers.communityId, input.communityId),
            eq(communityMembers.platformAccountId, input.platformAccountId),
          ),
        );
    },

    async countVerificationTimeouts(input) {
      const result = await db
        .select({
          value: count(),
        })
        .from(verificationSessions)
        .innerJoin(communities, eq(communities.platformResourceId, verificationSessions.communityId))
        .where(
          and(
            eq(communities.platform, input.platform),
            eq(verificationSessions.platformAccountId, input.platformAccountId),
            eq(verificationSessions.status, 'timeout'),
          ),
        )
        .get();

      return result?.value ?? 0;
    },

    async createBanIfNone(input) {
      const existing = await findActiveGlobalBan(db, input);

      if (existing) {
        return {
          status: 'existing',
          banId: existing.id,
        };
      }

      try {
        await db.insert(bannedUsers).values({
          id: input.id,
          platform: input.platform,
          platformAccountId: input.platformAccountId,
          reason: input.reason,
          bannedAt: input.bannedAt,
        });

        return {
          status: 'created',
          banId: input.id,
        };
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }

        const racedExisting = await findActiveGlobalBan(db, input);

        if (!racedExisting) {
          throw error;
        }

        return {
          status: 'existing',
          banId: racedExisting.id,
        };
      }
    },

    async appendAuditLog(input) {
      const values: typeof auditLogs.$inferInsert = {
        id: input.id,
        actorType: 'system',
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        platform: input.platform,
        platformAccountId: input.platformAccountId,
      };

      if (input.communityId) {
        values.communityId = input.communityId;
      }

      if (input.metadata) {
        values.metadataJson = JSON.stringify(input.metadata);
      }

      await db.insert(auditLogs).values(values);
    },
  };
};
