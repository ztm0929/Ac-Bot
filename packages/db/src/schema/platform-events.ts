import { sql } from 'drizzle-orm';
import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { platforms } from '@ac-bot/platform-contracts/core';

export const platformEvents = sqliteTable(
  'platform_events',
  {
    id: text('id').primaryKey(),
    platform: text('platform', { enum: platforms }).notNull(),
    rawEventId: text('raw_event_id').notNull(),
    eventType: text('event_type').notNull(),
    receivedAt: text('received_at').notNull(),
    payloadJson: text('payload_json').notNull(),
    processedAt: text('processed_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('platform_events_platform_raw_event_id_unique').on(table.platform, table.rawEventId),
  ],
);
