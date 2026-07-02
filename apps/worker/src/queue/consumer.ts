import { isPlatformEventEnvelope } from '@ac-bot/platform-contracts/core';

import {
  createJoinApplicationCreatedEventFromTelegramUpdate,
  isTelegramWebhookUpdate,
} from '../adapters/telegram/mapper.js';
import type { WorkerBindings } from '../app/env.js';
import { persistJoinApplicationCreatedEvent } from '../platform/db/join-applications.js';
import { persistPlatformEvent } from '../platform/db/platform-events.js';

export const consumePlatformEvents: ExportedHandlerQueueHandler<WorkerBindings, unknown> = async (batch, env) => {
  for (const message of batch.messages) {
    if (!isPlatformEventEnvelope(message.body)) {
      message.ack();
      continue;
    }

    const persisted = await persistPlatformEvent(env.DB, message.body);

    if (
      persisted.status === 'created' &&
      message.body.platform === 'telegram' &&
      message.body.eventType === 'telegram.update.received' &&
      isTelegramWebhookUpdate(message.body.payload)
    ) {
      const coreEvent = createJoinApplicationCreatedEventFromTelegramUpdate(
        message.body.payload,
        message.body.receivedAt,
      );

      if (coreEvent) {
        await persistJoinApplicationCreatedEvent(env.DB, coreEvent);
      }
    }

    message.ack();
  }
};
