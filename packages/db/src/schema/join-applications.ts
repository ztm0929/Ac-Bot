import { sql } from 'drizzle-orm';
import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { platforms } from '@ac-bot/platform-contracts/core';

export const joinApplicationStatuses = [
  'applied',
  'verification_pending',
  'manual_review',
  'approved',
  'rejected',
] as const;

export const joinApplications = sqliteTable(
  'join_applications',
  {
    id: text('id').primaryKey(),
    platform: text('platform', { enum: platforms }).notNull(),
    platformAccountId: text('platform_account_id').notNull(),
    communityId: text('community_id').notNull(),
    applicationId: text('application_id').notNull(),
    sourceId: text('source_id'),
    status: text('status', { enum: joinApplicationStatuses }).notNull().default('applied'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('join_applications_platform_application_id_unique').on(table.platform, table.applicationId),
    uniqueIndex('join_applications_one_active_per_account_unique')
      .on(table.communityId, table.platform, table.platformAccountId)
      .where(sql`status IN ('applied', 'verification_pending', 'manual_review')`),
  ],
);
