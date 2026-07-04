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

const collectErrorMessages = (error: unknown, visitedErrors = new Set<unknown>()): string[] => {
  if (visitedErrors.has(error)) {
    return [];
  }

  visitedErrors.add(error);

  if (error instanceof Error) {
    return [error.message, ...collectErrorMessages(error.cause, visitedErrors)];
  }

  if (typeof error !== 'object' || error === null || !('cause' in error)) {
    return [];
  }

  return collectErrorMessages(error.cause, visitedErrors);
};

const isUniqueConstraintError = (error: unknown) => {
  return collectErrorMessages(error).some((message) => {
    // D1 经由 Drizzle 抛出的唯一索引错误可能只把底层 SQLite 文案放在 cause 里；
    // 队列重试依赖这里识别重复事件，否则外部 API 失败后会被 platform_events 去重挡住。
    return (
      message.includes('UNIQUE constraint failed') ||
      message.includes('SQLITE_CONSTRAINT') ||
      message.includes('constraint failed')
    );
  });
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
