import { platformEvents } from '@ac-bot/db/schema';
import type { PlatformEventEnvelope } from '@ac-bot/platform-contracts/core';
import { drizzle } from 'drizzle-orm/d1';

export type PersistPlatformEventResult =
  | {
      status: 'created';
    }
  | {
      status: 'duplicate';
    };

const isUniqueConstraintError = (error: unknown) => {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
};

export const persistPlatformEvent = async (
  dbBinding: D1Database,
  envelope: PlatformEventEnvelope,
): Promise<PersistPlatformEventResult> => {
  const db = drizzle(dbBinding);

  try {
    await db.insert(platformEvents).values({
      id: crypto.randomUUID(),
      platform: envelope.platform,
      rawEventId: envelope.rawEventId,
      eventType: envelope.eventType,
      receivedAt: envelope.receivedAt,
      payloadJson: JSON.stringify(envelope.payload),
    });

    return { status: 'created' };
  } catch (error) {
    // Telegram 可能重试同一个 update；唯一索引命中时视为已处理，避免重复进入后续流程。
    if (isUniqueConstraintError(error)) {
      return { status: 'duplicate' };
    }

    throw error;
  }
};
