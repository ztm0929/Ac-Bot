import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { platforms } from '@ac-bot/platform-contracts/core';

export const communityKinds = ['group', 'channel', 'server', 'room'] as const;

export const communityMemberStatuses = [
  'visitor',
  'verification_pending',
  'verification_passed',
  'manual_review',
  'joined',
  'probation',
  'member',
  'restricted',
  'rejected',
  'banned',
  'left',
] as const;

export const verificationSessionStatuses = [
  'pending',
  'passed',
  'failed',
  'timeout',
  'cancelled',
] as const;

export const auditActorTypes = ['system', 'admin', 'member'] as const;

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const platformAccounts = sqliteTable(
  'platform_accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    platform: text('platform', { enum: platforms }).notNull(),
    platformUserId: text('platform_user_id').notNull(),
    username: text('username'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    bio: text('bio'),
    isPremium: integer('is_premium', { mode: 'boolean' }).notNull().default(false),
    hasAvatar: integer('has_avatar', { mode: 'boolean' }).notNull().default(false),
    rawProfileJson: text('raw_profile_json'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('platform_accounts_platform_user_id_unique').on(table.platform, table.platformUserId),
  ],
);

export const communities = sqliteTable(
  'communities',
  {
    id: text('id').primaryKey(),
    platform: text('platform', { enum: platforms }).notNull(),
    platformResourceId: text('platform_resource_id').notNull(),
    kind: text('kind', { enum: communityKinds }).notNull().default('group'),
    title: text('title'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('communities_platform_resource_id_unique').on(table.platform, table.platformResourceId),
  ],
);

export const communityMembers = sqliteTable(
  'community_members',
  {
    id: text('id').primaryKey(),
    communityId: text('community_id').notNull(),
    platformAccountId: text('platform_account_id').notNull(),
    status: text('status', { enum: communityMemberStatuses }).notNull().default('verification_pending'),
    joinedAt: text('joined_at'),
    probationUntil: text('probation_until'),
    leftAt: text('left_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('community_members_community_account_unique').on(
      table.communityId,
      table.platformAccountId,
    ),
  ],
);

export const verificationSessions = sqliteTable(
  'verification_sessions',
  {
    id: text('id').primaryKey(),
    communityId: text('community_id').notNull(),
    platformAccountId: text('platform_account_id').notNull(),
    status: text('status', { enum: verificationSessionStatuses }).notNull().default('pending'),
    channel: text('channel').notNull(),
    promptKey: text('prompt_key'),
    answerAttemptCount: integer('answer_attempt_count').notNull().default(0),
    timeoutAt: text('timeout_at').notNull(),
    completedAt: text('completed_at'),
    failureReason: text('failure_reason'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('verification_sessions_one_pending_per_account_unique')
      .on(table.communityId, table.platformAccountId)
      .where(sql`status = 'pending'`),
  ],
);

export const bannedUsers = sqliteTable(
  'banned_users',
  {
    id: text('id').primaryKey(),
    platform: text('platform', { enum: platforms }).notNull(),
    platformAccountId: text('platform_account_id').notNull(),
    communityId: text('community_id'),
    reason: text('reason'),
    bannedAt: text('banned_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    liftedAt: text('lifted_at'),
    createdByAdminPlatformAccountId: text('created_by_admin_platform_account_id'),
  },
  (table) => [
    uniqueIndex('banned_users_active_global_account_unique')
      .on(table.platform, table.platformAccountId)
      .where(sql`lifted_at IS NULL AND community_id IS NULL`),
    uniqueIndex('banned_users_active_community_account_unique')
      .on(table.platform, table.platformAccountId, table.communityId)
      .where(sql`lifted_at IS NULL AND community_id IS NOT NULL`),
  ],
);

export const adminUsers = sqliteTable(
  'admin_users',
  {
    id: text('id').primaryKey(),
    platform: text('platform', { enum: platforms }).notNull(),
    platformAccountId: text('platform_account_id').notNull(),
    displayName: text('display_name'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('admin_users_platform_account_unique').on(table.platform, table.platformAccountId),
  ],
);

export const adminActions = sqliteTable('admin_actions', {
  id: text('id').primaryKey(),
  adminUserId: text('admin_user_id').notNull(),
  action: text('action').notNull(),
  communityId: text('community_id'),
  targetPlatformAccountId: text('target_platform_account_id'),
  reason: text('reason'),
  metadataJson: text('metadata_json'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actorType: text('actor_type', { enum: auditActorTypes }).notNull(),
  actorPlatform: text('actor_platform', { enum: platforms }),
  actorPlatformAccountId: text('actor_platform_account_id'),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  communityId: text('community_id'),
  platform: text('platform', { enum: platforms }),
  platformAccountId: text('platform_account_id'),
  reason: text('reason'),
  metadataJson: text('metadata_json'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
