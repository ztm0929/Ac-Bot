import { joinApplications } from '@ac-bot/db/schema';
import type { CoreEventEnvelope, JoinApplicationCreatedPayload } from '@ac-bot/platform-contracts/core';
import { desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

export type PersistJoinApplicationResult =
  | {
      status: 'created';
    }
  | {
      status: 'duplicate';
    };

const isUniqueConstraintError = (error: unknown) => {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
};

export const persistJoinApplicationCreatedEvent = async (
  dbBinding: D1Database,
  event: CoreEventEnvelope<JoinApplicationCreatedPayload>,
): Promise<PersistJoinApplicationResult> => {
  const db = drizzle(dbBinding);

  try {
    const values: typeof joinApplications.$inferInsert = {
      id: crypto.randomUUID(),
      platform: event.payload.platform,
      platformAccountId: event.payload.platformAccountId,
      communityId: event.payload.communityId,
      applicationId: event.payload.applicationId,
    };

    if (event.payload.sourceId) {
      values.sourceId = event.payload.sourceId;
    }

    await db.insert(joinApplications).values(values);

    return { status: 'created' };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: 'duplicate' };
    }

    throw error;
  }
};

export type JoinApplicationRecord = typeof joinApplications.$inferSelect;

export const listAppliedJoinApplications = async (
  dbBinding: D1Database,
  limit = 5,
): Promise<JoinApplicationRecord[]> => {
  const db = drizzle(dbBinding);

  return db
    .select()
    .from(joinApplications)
    .where(eq(joinApplications.status, 'applied'))
    .orderBy(desc(joinApplications.createdAt))
    .limit(limit);
};
